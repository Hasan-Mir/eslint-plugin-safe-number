import { noUnsafeNumberConversion } from './rules/no-unsafe-number-conversion';

const rules = {
    'no-unsafe-number-conversion': noUnsafeNumberConversion,
};

const plugin = {
    meta: {
        name: 'eslint-plugin-safe-number',
        version: '1.1.4',
    },
    rules,
    configs: {} as {
        recommended: {
            plugins: string[];
            rules: Record<string, 'error'>;
        };
        'flat/recommended': {
            files: string[];
            plugins: {
                'safe-number': {
                    meta: {
                        name: string;
                        version: string;
                    };
                    rules: typeof rules;
                };
            };
            rules: Record<string, 'error'>;
        };
    },
};

Object.assign(plugin.configs, {
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
            'safe-number': plugin,
        },
        rules: {
            'safe-number/no-unsafe-number-conversion': 'error',
        },
    },
});

export = plugin;
