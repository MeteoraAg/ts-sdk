import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'

// Curve + Math constants
export const OFFSET: number = 64
export const U64_MAX: BN = new BN('18446744073709551615')
export const MIN_SQRT_PRICE: BN = new BN('4295048016')
export const MAX_SQRT_PRICE: BN = new BN('79226673521066979257578248091')

export const RESOLUTION = 64
export const ONE_Q64 = new BN(1).shln(RESOLUTION)
export const FEE_DENOMINATOR = 1_000_000_000
export const MAX_FEE_NUMERATOR = 500_000_000 // 50%
export const BASIS_POINT_MAX = 10000
export const MAX_CURVE_POINT = 16
export const PARTNER_SURPLUS_SHARE = 80 // 80%
export const SWAP_BUFFER_PERCENTAGE = 25 // 25%
export const MAX_SWALLOW_PERCENTAGE = 20 // 20%

// Pubkey
export const DYNAMIC_BONDING_CURVE_PROGRAM_ID = new PublicKey(
    'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
)
export const METAPLEX_PROGRAM_ID = new PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
)
export const DAMM_V1_PROGRAM_ID = new PublicKey(
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'
)
export const DAMM_V2_PROGRAM_ID = new PublicKey(
    'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'
)
export const VAULT_PROGRAM_ID = new PublicKey(
    '24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi'
)
export const LOCKER_PROGRAM_ID = new PublicKey(
    'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn'
)
export const BASE_ADDRESS = new PublicKey(
    'HWzXGcGHy4tcpYfaRDCyLNzXqBTv3E6BttpCH2vJxArv'
)
