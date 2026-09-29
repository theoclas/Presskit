import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

// Global: auth, admin y (en M3) el panel del DJ mandan correos sin importar el módulo cada vez.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
