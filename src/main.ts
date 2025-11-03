import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseCli, printHelp } from './cli-options';
import { OzonParserService } from './ozon-parser.service';

type CliOptions = import('./cli-options').CliOptions;

async function bootstrap() {
  let cli: CliOptions;
  let helpRequested = false;
  try {
    const result = parseCli(process.argv.slice(2));
    cli = result.options;
    helpRequested = result.helpRequested;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`Argument error: ${message}`);
    printHelp();
    process.exit(1);
    return;
  }

  if (helpRequested) {
    printHelp();
    process.exit(0);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const logger = new Logger('CLI');

  try {
    const parser = app.get(OzonParserService);
    await parser.run({
      url: cli.url,
      output: cli.output,
      headless: cli.headless,
      timeoutMs: cli.timeoutMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    if (cli.verbose && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Fatal error: ${message}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
