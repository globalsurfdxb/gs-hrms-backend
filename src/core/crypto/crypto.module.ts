import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { FieldCipher } from '../../shared/crypto/field-cipher.js';

@Global()
@Module({
  providers: [
    {
      provide: FieldCipher,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new FieldCipher(
          Buffer.from(config.get('FIELD_ENCRYPTION_KEY', { infer: true }), 'base64'),
          Buffer.from(config.get('FIELD_BLIND_INDEX_KEY', { infer: true }), 'base64'),
        ),
    },
  ],
  exports: [FieldCipher],
})
export class CryptoModule {}
