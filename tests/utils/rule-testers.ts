import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import tsParser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';

/*
 * 🧪 The `no-unsafe-number-conversion` rule inspects the TypeScript `TypeChecker`,
 * so every test needs real `parserOptions.project` parser services.
 */
const FIXTURE_DIRECTORY = path.join(
    os.tmpdir(),
    `eslint-plugin-safe-number-rule-tester-${process.pid}`
);

/** The single placeholder file that every test case is linted as. */
export const typeAwareFilename = 'test.ts';

const FIXTURE_TSCONFIG = {
    compilerOptions: {
        strict: true,
        target: 'ES2022',
        lib: ['ES2022', 'DOM'],
        moduleResolution: 'node',
        skipLibCheck: true,
    },
    include: ['*.ts'],
};

const createFixtureProject = (): void => {
    fs.rmSync(FIXTURE_DIRECTORY, { recursive: true, force: true });
    fs.mkdirSync(FIXTURE_DIRECTORY, { recursive: true });
    fs.writeFileSync(
        path.join(FIXTURE_DIRECTORY, 'tsconfig.json'),
        `${JSON.stringify(FIXTURE_TSCONFIG, null, 4)}\n`
    );
    fs.writeFileSync(
        path.join(FIXTURE_DIRECTORY, typeAwareFilename),
        '// 🧪 Placeholder file for RuleTester type-aware linting.\n'
    );
};

createFixtureProject();

after(() => {
    try {
        fs.rmSync(FIXTURE_DIRECTORY, { recursive: true, force: true });
    } catch {
        // The operating system cleans up its temporary directory, so a locked file is not a failure.
    }
});

/*
 * Wire `@typescript-eslint/rule-tester` to `node:test` runner.
 */
RuleTester.afterAll = after;
RuleTester.describe = describe;
RuleTester.it = it;

/** Rule tester with real type information from a `tsconfig.json` fixture project. */
export const ruleTester = new RuleTester({
    defaultFilenames: { ts: typeAwareFilename, tsx: typeAwareFilename },
    languageOptions: {
        parser: tsParser,
        parserOptions: {
            project: './tsconfig.json',
            tsconfigRootDir: FIXTURE_DIRECTORY,
        },
    },
});
