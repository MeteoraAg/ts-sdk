import { BN } from 'bn.js'

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

// Q64.64 format helper
export const Q = (n: number) => {
    const bigIntValue = BigInt(Math.floor(n * 2 ** 64))
    return new BN(bigIntValue.toString())
}
