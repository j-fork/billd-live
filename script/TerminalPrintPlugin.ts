import chalk from 'chalk';
import { Compiler } from 'webpack';
import WebpackDevServer from 'webpack-dev-server';

const localIPv4 = WebpackDevServer.internalIPSync('v4');

class TerminalPrintPlugin {
  constructor() {}

  apply(compiler: Compiler) {
    compiler.hooks.done.tapAsync('TerminalPrintPlugin', (stats, callback) => {
      const publicPath = stats.compilation.outputOptions.publicPath as string;
      const port = stats.compilation.options.devServer!.port as number;
      console.log('  App running at:');
      console.log(
        `- Local:    ${chalk.cyan(`http://localhost:${port}${publicPath}`)}`
      );
      console.log(
        `- Network:  ${chalk.cyan(`http://${localIPv4!}:${port}${publicPath}`)}`
      );
      console.log(
        `- 赞助支持: ${chalk.cyan(`https://live.hsslive.cn/sponsors`)}`
      );
      console.log(
        `- 付费咨询: ${chalk.cyan(`https://live.hsslive.cn/support`)}`
      );
      console.log(
        `- 欢迎PR:   ${chalk.cyan(
          `billd-live目前只有作者一人开发，难免有不足的地方，欢迎提PR或Issue`
        )}`
      );
      console.log();
      callback();
    });
  }
}

export default TerminalPrintPlugin;
