import {
    Connection,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
} from '@solana/web3.js'

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createCloseAccountInstruction,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TokenAccountNotFoundError,
    TokenInvalidAccountOwnerError,
} from '@solana/spl-token'
import { TokenType } from '../types'

/**
 * Get or create an ATA instruction
 * @param connection - The connection
 * @param tokenMint - The token mint
 * @param owner - The owner
 * @param payer - The payer
 * @param allowOwnerOffCurve - Whether to allow the owner to be off curve
 * @param tokenProgram - The token program
 * @returns The ATA instruction
 */
export const getOrCreateATAInstruction = async (
    connection: Connection,
    tokenMint: PublicKey,
    owner: PublicKey,
    payer: PublicKey,
    allowOwnerOffCurve = true,
    tokenProgram: PublicKey
): Promise<{ ataPubkey: PublicKey; ix?: TransactionInstruction }> => {
    const toAccount = getAssociatedTokenAddressSync(
        tokenMint,
        owner,
        allowOwnerOffCurve,
        tokenProgram
    )

    try {
        await getAccount(connection, toAccount)
        return { ataPubkey: toAccount, ix: undefined }
    } catch (e) {
        if (
            e instanceof TokenAccountNotFoundError ||
            e instanceof TokenInvalidAccountOwnerError
        ) {
            const ix = createAssociatedTokenAccountIdempotentInstruction(
                payer,
                toAccount,
                owner,
                tokenMint,
                tokenProgram
            )

            return { ataPubkey: toAccount, ix }
        } else {
            /* handle error */
            console.error('Error::getOrCreateATAInstruction', e)
            throw e
        }
    }
}

/**
 * Create an unwrap SOL instruction
 * @param owner - The owner of the SOL
 * @param receiver - The receiver of the SOL
 * @param allowOwnerOffCurve - Whether to allow the owner to be off curve
 * @returns The unwrap SOL instruction
 */
export function unwrapSOLInstruction(
    owner: PublicKey,
    receiver: PublicKey,
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
            receiver,
            owner,
            [],
            TOKEN_PROGRAM_ID
        )
        return closedWrappedSolInstruction
    }
    return null
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
 * Get token decimals for a particular mint
 * @param mintAddress - The mint address to get decimals for
 * @returns The number of decimals for the token
 */
export async function getTokenDecimals(
    connection: Connection,
    mintAddress: PublicKey | string
): Promise<number> {
    const mintPubkey =
        mintAddress instanceof PublicKey
            ? mintAddress
            : new PublicKey(mintAddress)

    const tokenProgram = (await connection.getAccountInfo(mintPubkey)).owner

    const mintInfo = await getMint(
        connection,
        mintPubkey,
        'confirmed',
        tokenProgram
    )
    return mintInfo.decimals
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
