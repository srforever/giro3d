import chalk from 'chalk';

export function log(module, output) {
    console.log(chalk.blue(`[${module}]`) + ' ' + output);
}

export function logOk(module, output) {
    console.log(chalk.blue(`[${module}]`) + ' ' + chalk.green(output));
}

export function logWarning(module, output) {
    console.warn(chalk.blue(`[${module}]`) + ' ' + chalk.yellow(output));
}

export function logError(module, output) {
    console.error(chalk.blue(`[${module}]`) + ' ' + chalk.red(output));
}

export function logWatched(module, file) {
    console.log('\n' + chalk.blue(`[${module}]`) + ' ' + chalk.magenta(`Modified: ${file}`));
}
