import { noUnsafeNumberConversion } from './rules/no-unsafe-number-conversion';

export const rules = {
    'no-unsafe-number-conversion': noUnsafeNumberConversion,
};

export const configs = {
    // Legacy ESLint (≤ 8)
    recommended: {
        plugins: ['safe-number'],
        rules: {
            'safe-number/no-unsafe-number-conversion': 'error',
        },
    },

    // Flat Config (ESLint 9+)
    'flat/recommended': {
        files: ['**/*.{ts,tsx}'],
        plugins: {
            'safe-number': { rules },
        },
        rules: {
            'safe-number/no-unsafe-number-conversion': 'error',
        },
    },
};
