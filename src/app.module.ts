import { Module } from '@nestjs/common';
import { OzonParserService } from './ozon-parser.service';

@Module({
  providers: [OzonParserService],
})
export class AppModule {}
