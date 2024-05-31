import chalk from 'chalk';

export function log(module, output) {
    console.log(chalk.blue(`[${module}]`) + ' ' + output);
}

export function logOk(module, output) {
    console.log(chalk.blue(`[${module}]`) + ' ' + chalk.green(output));
}

export function logWatched(module, file) {
    console.log('\n' + chalk.blue(`[${module}]`) + ' ' + chalk.magenta(`Modified: ${file}`));
}
