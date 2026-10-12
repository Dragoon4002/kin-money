// Kin Orchestrator — Chainlink CRE workflow.
// Every run: (1) fetch USD→local FX rates from 3 public APIs, median per currency, then median across nodes;
// (2) find Kin money jobs that are due now (AutoPay collects, dated gift links, circle rounds, escrow releases) by
// dry-running each candidate through Multicall3; (3) write one signed report to KinKeeper on Monad, which stores the
// rates and runs the jobs. Payees get their push from Kin's existing payment-received pipeline (Alchemy webhook).
import {
	bytesToHex,
	ConsensusAggregationByFields,
	type CronPayload,
	cre,
	encodeCallMsg,
	getNetwork,
	type HTTPSendRequester,
	LAST_FINALIZED_BLOCK_NUMBER,
	median,
	prepareReportRequest,
	Runner,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import {
	type Address,
	decodeFunctionResult,
	encodeAbiParameters,
	encodeFunctionData,
	type Hex,
	parseAbi,
	stringToHex,
	zeroAddress,
} from 'viem'
import { z } from 'zod'

const configSchema = z.object({
	schedule: z.string(),
	chainSelectorName: z.string(),
	keeper: z.string(),
	multicall: z.string(),
	mandate: z.string(),
	giftLink: z.string(),
	circle: z.string(),
	escrow: z.string(),
	scan: z.number(), // newest N ids per contract to check
	maxJobs: z.number(), // per report, bounds gas
	gasLimit: z.string(),
})
type Config = z.infer<typeof configSchema>

// Same currencies as the app's FX table (app/src/lib/money.ts).
const CODES = ['INR', 'PHP', 'MXN', 'NGN', 'AED', 'GBP', 'EUR'] as const
type Code = (typeof CODES)[number]
type Rates = Record<Code, number>

const SOURCES: { url: string; pick: (j: any) => Record<string, number> }[] = [
	{ url: 'https://open.er-api.com/v6/latest/USD', pick: (j) => j.rates },
	{
		url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
		pick: (j) => Object.fromEntries(CODES.map((c) => [c, j.usd[c.toLowerCase()]])),
	},
	{ url: 'https://api.frankfurter.app/latest?from=USD', pick: (j) => j.rates }, // ECB: no AED/NGN, others cover it
]

const mid = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b)
	return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

// Runs on every node; each node returns its own per-currency median, then CRE takes the median across nodes.
const fetchRates = (http: HTTPSendRequester): Rates => {
	const seen: Record<string, number[]> = {}
	for (const src of SOURCES) {
		try {
			const res = http.sendRequest({ method: 'GET', url: src.url }).result()
			if (res.statusCode !== 200) continue
			const rates = src.pick(JSON.parse(Buffer.from(res.body).toString('utf-8')))
			for (const c of CODES) if (rates[c] > 0) (seen[c] ??= []).push(rates[c])
		} catch {} // one source down must not stop the run
	}
	const out = {} as Rates
	for (const c of CODES) {
		if (!seen[c]?.length) throw new Error(`no rate for ${c}`)
		out[c] = mid(seen[c])
	}
	return out
}

const countAbi = parseAbi(['function count() view returns (uint256)'])
const multicallAbi = parseAbi([
	'struct Call3 { address target; bool allowFailure; bytes callData; }',
	'struct Result { bool success; bytes returnData; }',
	'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
])
const jobAbi = parseAbi([
	'function collect(uint256 id)',
	'function open(uint256 id)',
	'function settle(uint256 id)',
	'function release(uint256 id)',
])
const JOBS = [
	{ key: 'mandate', fn: 'collect' },
	{ key: 'giftLink', fn: 'open' },
	{ key: 'circle', fn: 'settle' },
	{ key: 'escrow', fn: 'release' },
] as const

type Call3 = { target: Address; allowFailure: boolean; callData: Hex }

const aggregate = (runtime: Runtime<Config>, evm: InstanceType<typeof cre.capabilities.EVMClient>, calls: Call3[]) => {
	const data = encodeFunctionData({ abi: multicallAbi, functionName: 'aggregate3', args: [calls] })
	const res = evm
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: runtime.config.multicall as Address, data }),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	return decodeFunctionResult({ abi: multicallAbi, functionName: 'aggregate3', data: bytesToHex(res.data) })
}

// A job is due iff calling it right now would succeed. Dry-run every candidate in one Multicall3 eth_call
// (allowFailure) — the contracts already encode every rule (due date, unlock time, round end, approval).
const findDueJobs = (runtime: Runtime<Config>, evm: InstanceType<typeof cre.capabilities.EVMClient>): bigint[][] => {
	const cfg = runtime.config
	const counts = aggregate(
		runtime,
		evm,
		JOBS.map((j) => ({
			target: cfg[j.key] as Address,
			allowFailure: true,
			callData: encodeFunctionData({ abi: countAbi, functionName: 'count' }),
		})),
	).map((r) => (r.success ? BigInt(r.returnData) : 0n))

	const candidates: { kind: number; id: bigint; call: Call3 }[] = []
	JOBS.forEach((j, kind) => {
		for (let id = counts[kind]; id >= 1n && counts[kind] - id < BigInt(cfg.scan); id--) {
			candidates.push({
				kind,
				id,
				call: {
					target: cfg[j.key] as Address,
					allowFailure: true,
					callData: encodeFunctionData({ abi: jobAbi, functionName: j.fn, args: [id] }),
				},
			})
		}
	})
	const results = candidates.length ? aggregate(runtime, evm, candidates.map((c) => c.call)) : []

	const due: bigint[][] = [[], [], [], []]
	let n = 0
	results.forEach((r, i) => {
		if (r.success && n < cfg.maxJobs) {
			due[candidates[i].kind].push(candidates[i].id)
			n++
		}
	})
	runtime.log(`scanned ${candidates.length} · due collect=${due[0]} open=${due[1]} settle=${due[2]} release=${due[3]}`)
	return due
}

const onCron = (runtime: Runtime<Config>, _: CronPayload): string => {
	const cfg = runtime.config
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: cfg.chainSelectorName, isTestnet: true })
	if (!network) throw new Error(`unknown chain ${cfg.chainSelectorName}`)
	const evm = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const http = new cre.capabilities.HTTPClient()

	// 1. Offchain data → consensus.
	const rates = http
		.sendRequest(
			runtime,
			fetchRates,
			ConsensusAggregationByFields<Rates>(Object.fromEntries(CODES.map((c) => [c, median])) as any),
		)()
		.result()
	runtime.log(`rates ${JSON.stringify(rates)}`)

	// 2. Onchain state → due jobs.
	const [collects, opens, settles, releases] = findDueJobs(runtime, evm)

	// 3. One report → KinKeeper.onReport (stores rates, runs jobs).
	const report = encodeAbiParameters(
		[
			{ type: 'bytes3[]' },
			{ type: 'uint64[]' },
			{ type: 'uint256[]' },
			{ type: 'uint256[]' },
			{ type: 'uint256[]' },
			{ type: 'uint256[]' },
		],
		[
			CODES.map((c) => stringToHex(c, { size: 3 })),
			CODES.map((c) => BigInt(Math.round(rates[c] * 1e6))),
			collects,
			opens,
			settles,
			releases,
		],
	)
	const signed = runtime.report(prepareReportRequest(report)).result()
	const tx = evm
		.writeReport(runtime, { receiver: cfg.keeper as Address, report: signed, gasConfig: { gasLimit: cfg.gasLimit } })
		.result()
	if (tx.txStatus !== TxStatus.SUCCESS) throw new Error(`write failed: ${tx.errorMessage || tx.txStatus}`)
	const txHash = bytesToHex(tx.txHash || new Uint8Array(32))
	runtime.log(`KinKeeper report tx ${txHash}`)

	return txHash
}

function initWorkflow(config: Config) {
	return [cre.handler(new cre.capabilities.CronCapability().trigger({ schedule: config.schedule }), onCron)]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema })
	await runner.run(initWorkflow)
}

main()
