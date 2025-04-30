import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import { createAssociatedTokenAccountIdempotentInstruction, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import {
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    type Connection,
    type GetProgramAccountsFilter,
} from '@solana/web3.js'
import type { DynamicBondingCurve } from './idl/dynamic-bonding-curve/idl'
import DynamicBondingCurveJsonIDL from './idl/dynamic-bonding-curve/idl.json'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from './idl/dynamic-bonding-curve/idl'
import type { DynamicVault } from './idl/dynamic-vault/idl'
import DynamicVaultIDL from './idl/dynamic-vault/idl.json'
import type { DammV1 } from './idl/damm-v1/idl'
import DammV1IDL from './idl/damm-v1/idl.json'
import type { DammV2 } from './idl/damm-v2/idl'
import DammV2IDL from './idl/damm-v2/idl.json'
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createCloseAccountInstruction,
    getAssociatedTokenAddressSync,
    NATIVE_MINT,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { SwapParam, TokenType } from './types'
import BN from 'bn.js'
import { COMMITMENT } from './constants'
import { derivePoolAuthority } from './derive'

/**
 * Get the first key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The first key
 */
export function getFirstKey(key1: PublicKey, key2: PublicKey) {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf1
    }
    return buf2
}

/**
 * Get the second key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The second key
 */
export function getSecondKey(key1: PublicKey, key2: PublicKey) {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf2
    }
    return buf1
}

/**
 * Create a program instance
 * @param connection - The connection to the network
 * @returns The program instance
 */
export function createProgram(connection: Connection) {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment: COMMITMENT,
    })
    const program = new Program<DynamicBondingCurve>(
        DynamicBondingCurveJsonIDL,
        provider
    )

    return { program }
}

/**
 * Create a vault program instance
 * @param connection - The connection to the network
 * @returns The vault program instance
 */
export function createVaultProgram(
    connection: Connection
): Program<DynamicVault> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment: COMMITMENT,
    })

    const program = new Program<DynamicVault>(DynamicVaultIDL, provider)
    return program
}

/**
 * Create a DAMM V1 program instance
 * @param connection - The connection to the network
 * @returns The DAMM V1 program instance
 */
export function createDammV1Program(connection: Connection): Program<DammV1> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment: COMMITMENT,
    })

    const program = new Program<DammV1>(DammV1IDL, provider)
    return program
}

/**
 * Create a DAMM V1 program instance
 * @param connection - The connection to the network
 * @returns The DAMM V1 program instance
 */
export function createDammV2Program(connection: Connection): Program<DammV2> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment: COMMITMENT,
    })

    const program = new Program<DammV2>(DammV2IDL, provider)
    return program
}

/**
 * Find the associated token address for a wallet and token mint
 * @param walletAddress - The wallet address
 * @param tokenMintAddress - The token mint address
 * @param tokenProgramId - The token program ID
 * @returns The associated token address
 */
export function findAssociatedTokenAddress(
    walletAddress: PublicKey,
    tokenMintAddress: PublicKey,
    tokenProgramId: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [
            walletAddress.toBuffer(),
            tokenProgramId.toBuffer(),
            tokenMintAddress.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    )[0]
}

/**
 * Create a wrap SOL instruction
 * @param from - The from address
 * @param to - The to address
 * @param amount - The amount to wrap
 * @returns The wrap SOL instruction
 */
export function wrapSOLInstruction(
    from: PublicKey,
    to: PublicKey,
    amount: bigint
): TransactionInstruction[] {
    return [
        SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amount,
        }),
        new TransactionInstruction({
            keys: [
                {
                    pubkey: to,
                    isSigner: false,
                    isWritable: true,
                },
            ],
            data: Buffer.from(new Uint8Array([17])),
            programId: TOKEN_PROGRAM_ID,
        }),
    ]
}

/**
 * Create an unwrap SOL instruction
 * @param owner - The owner of the SOL
 * @param allowOwnerOffCurve - Whether to allow the owner to be off curve
 * @returns The unwrap SOL instruction
 */
export function unwrapSOLInstruction(
    owner: PublicKey,
    allowOwnerOffCurve = true
): TransactionInstruction | null {
    const wSolATAAccount = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        owner,
        allowOwnerOffCurve
    )
    if (wSolATAAccount) {
        const closedWrappedSolInstruction = createCloseAccountInstruction(
            wSolATAAccount,
            owner,
            owner,
            [],
            TOKEN_PROGRAM_ID
        )
        return closedWrappedSolInstruction
    }
    return null
}

/**
 * Get the token program for a given token type
 * @param tokenType - The token type
 * @returns The token program
 */
export function getTokenProgram(tokenType: TokenType): PublicKey {
    return tokenType === TokenType.SPL
        ? TOKEN_PROGRAM_ID
        : TOKEN_2022_PROGRAM_ID
}

/**
 * Create a memcmp filter for owner-based filtering
 * @param owner - The owner public key or string
 * @param offset - The offset where the owner field is located in the account data
 * @returns A GetProgramAccountsFilter array with the owner filter
 */
export function createProgramAccountFilter(
    owner: PublicKey | string,
    offset: number
): GetProgramAccountsFilter[] {
    const ownerKey = typeof owner === 'string' ? new PublicKey(owner) : owner
    return [
        {
            memcmp: {
                offset,
                bytes: ownerKey.toBase58(),
                encoding: 'base58',
            },
        },
    ]
}

/**
 * Generic account fetch helper
 * @param accountAddress - The address of the account to fetch
 * @param accountType - The type of account to fetch from program.account
 * @returns The fetched account data
 */
export async function getAccountData<T>(
    accountAddress: PublicKey | string,
    accountType: keyof Program<DynamicBondingCurve>['account'],
    program: Program<DynamicBondingCurve>
): Promise<T> {
    const address =
        accountAddress instanceof PublicKey
            ? accountAddress
            : new PublicKey(accountAddress)

    return (await program.account[accountType].fetchNullable(address)) as T
}

/**
 * Check if a mint is the native SOL mint
 * @param mint - The mint to check
 * @returns Whether the mint is the native SOL mint
 */
export function isNativeSol(mint: PublicKey): boolean {
    return mint.toString() === NATIVE_MINT.toString()
}

// Helper function to convert BN values to decimal strings
export function convertBNToDecimal<T>(obj: T): T {
    if (obj instanceof BN) {
        return obj.toString(10) as T
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => convertBNToDecimal(item)) as T
    }
    if (obj && typeof obj === 'object') {
        const result = {} as T
        for (const key in obj) {
            result[key] = convertBNToDecimal(obj[key])
        }
        return result
    }
    return obj
}

/**
 * Swap between base and quote tokens in a pool pre-launch (no account or balance validation)
 * @param program - The program instance
 * @param connection - The solana connection
 * @param swapParam - The parameters for the swap
 * @param config - The pool configuration account
 * @param baseMint - The base token mint
 * @param quoteMint - The quote token mint
 * @param baseMintType - The type of the base token
 * @param quoteMintType - The type of the quote token
 * @param baseVault - The base token vault
 * @param quoteVault - The quote token vault
 * @returns A list of instructions to buy tokens from a pool pre-launch 
 */
export async function getBuyInstructionsPreLaunch(
    program: Program<DynamicBondingCurveIDL>,
    connection: Connection,
    swapParam: SwapParam,
    config: PublicKey,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    baseMintType: TokenType,
    quoteMintType: TokenType,
    baseVault: PublicKey,
    quoteVault: PublicKey,
)
    : Promise<TransactionInstruction[]> {
    const poolAuthority = derivePoolAuthority(program.programId)
    const { amountIn, minimumAmountOut, swapBaseForQuote, owner } = swapParam;

    let inputMint, outputMint, inputTokenProgram, outputTokenProgram;

    if (swapBaseForQuote) {
        inputMint = baseMint;
        outputMint = quoteMint;
        inputTokenProgram = getTokenProgram(baseMintType);
        outputTokenProgram = getTokenProgram(quoteMintType);
    } else {
        inputMint = quoteMint;
        outputMint = baseMint;
        inputTokenProgram = getTokenProgram(quoteMintType);
        outputTokenProgram = getTokenProgram(baseMintType);
    }

    const isSOLInput = isNativeSol(inputMint)
    const isSOLOutput = isNativeSol(outputMint)

    const inputTokenAccount = findAssociatedTokenAddress(
        owner,
        inputMint,
        inputTokenProgram
    )

    const outputTokenAccount = findAssociatedTokenAddress(
        owner,
        outputMint,
        outputTokenProgram
    )

    const accounts = {
        poolAuthority,
        config: config,
        pool: swapParam.pool,
        inputTokenAccount,
        outputTokenAccount,
        baseVault: baseVault,
        quoteVault: quoteVault,
        baseMint: baseMint,
        quoteMint: quoteMint,
        payer: owner,
        tokenBaseProgram: swapBaseForQuote
            ? inputTokenProgram
            : outputTokenProgram,
        tokenQuoteProgram: swapBaseForQuote
            ? outputTokenProgram
            : inputTokenProgram,
        referralTokenAccount: swapParam.referralTokenAccount,
    }

    // Add preInstructions for ATA creation and SOL wrapping
    const preInstructions: TransactionInstruction[] = []

    // Check and create ATAs if needed
    const inputTokenAccountInfo = await connection.getAccountInfo(inputTokenAccount)

    if (!inputTokenAccountInfo) {
        preInstructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                owner,
                inputTokenAccount,
                owner,
                inputMint,
                inputTokenProgram
            )
        )
    }

    const outputTokenAccountInfo = await connection.getAccountInfo(outputTokenAccount)

    if (!outputTokenAccountInfo) {
        preInstructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                owner,
                outputTokenAccount,
                owner,
                outputMint,
                outputTokenProgram
            )
        )
    }

    // Add SOL wrapping instructions if needed
    if (isSOLInput) {
        preInstructions.push(
            ...wrapSOLInstruction(
                owner,
                inputTokenAccount,
                BigInt(amountIn.toString())
            )
        )
    }

    // Add postInstructions for SOL unwrapping
    const postInstructions: TransactionInstruction[] = []
    if (isSOLInput || isSOLOutput) {
        const unwrapIx = unwrapSOLInstruction(owner)
        if (unwrapIx) {
            postInstructions.push(unwrapIx)
        }
    }

    const instruction = await program.methods
        .swap({
            amountIn,
            minimumAmountOut,
        })
        .accountsPartial(accounts)
        .instruction()

    return [...preInstructions, instruction, ...postInstructions]
}