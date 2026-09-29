import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  actorUsername?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  profileId?: string | null;
  /** Nombres de campos cambiados o datos no sensibles. Nunca contraseñas, tokens ni valores personales. */
  metadata?: Record<string, unknown> | null;
  ipHash?: string | null;
}

type Tx = Prisma.TransactionClient | PrismaService;

/** Registro de auditoría de solo inserción. También se escribe en el log. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Tx = this.prisma): Promise<void> {
    const metadata = entry.metadata ? truncateMeta(entry.metadata) : undefined;
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorUsername: entry.actorUsername ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        profileId: entry.profileId ?? null,
        metadata: metadata === undefined ? Prisma.JsonNull : (metadata as Prisma.InputJsonValue),
        ipHash: entry.ipHash ?? null,
      },
    });
    this.logger.log(`${entry.action} actor=${entry.actorUsername ?? '-'} target=${entry.targetType ?? '-'}:${entry.targetId ?? '-'}`);
  }

}

function truncateMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(meta);
  if (json.length <= 2048) return meta;
  return { truncated: true, keys: Object.keys(meta).slice(0, 30) };
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
