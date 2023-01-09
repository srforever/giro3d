/* eslint-disable import/no-extraneous-dependencies */
import esMain from 'es-main';
import glob from 'glob';
import { exit } from 'process';

async function main() {
    const args = process.argv;

    for (const folder of args.slice(2)) {
        glob(`${folder}/**/[A-Z]*/`, {}, (err, dirs) => {
            if (dirs && dirs.length > 0) {
                for (const invalid of dirs) {
                    console.error(`invalid directory name: ${invalid}`);
                }
                exit(1);
            }
        });
    }
}

/**
 * If running this module directly, read the config file, call the main
 * function, and write the output file.
 */
if (esMain(import.meta)) {
    main().catch(err => {
        process.stderr.write(`${err.message}\n`, () => process.exit(1));
    });
}
