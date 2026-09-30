import { Injectable } from '@nestjs/common';
import { LIMITS, cleanText, isValidPhone, type LegalInfoDto } from '@fersua/shared';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { LegalInfoBody } from './dto/editor.dto';
import type { EditorActor } from './editor-actor';
import { toLegalInfoDto } from './editor.mappers';
import { FieldCheck } from './field-check';
import { normalizeDocNumber } from './profile-rules';
import { ProfileStore } from './profile-store.service';

const L = LIMITS.legalInfo;

/**
 * Registro privado del oferente (art. 53 Ley 1480, portal de contacto). Lo ven el dueño y el
 * admin; nunca sale en respuestas públicas. La auditoría guarda solo los nombres de los campos.
 */
@Injectable()
export class ProfileLegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
  ) {}

  /**
   * Datos personales del responsable (nombre, documento, dirección): cada lectura del admin
   * queda en la auditoría, sin los valores, igual que el detalle de una solicitud. El dueño
   * leyendo lo suyo no se audita.
   */
  async get(profileId: ScopedProfileId, actor: EditorActor): Promise<LegalInfoDto> {
    const row = await this.prisma.djLegalInfo.findUnique({ where: { profileId } });
    if (row && actor.asAdmin) {
      await this.store.transaction((tx) =>
        this.store.record(tx, profileId, actor, 'legal_info_view', { targetType: 'DjLegalInfo', targetId: row.id, touch: false }),
      );
    }
    return toLegalInfoDto(row);
  }

  /**
   * Guarda el registro. El dueño declara cada vez que los datos son veraces (`truthful: true`,
   * docs/diseno/11 §2.4) y la declaración queda en la auditoría (`declared: true`) con los
   * nombres de los campos cambiados. El admin no declara nada (carga lo que le entregan).
   */
  async put(profileId: ScopedProfileId, actor: EditorActor, body: LegalInfoBody): Promise<LegalInfoDto> {
    const check = new FieldCheck();
    if (!actor.asAdmin && (body.truthful as boolean | undefined) !== true) check.fail('truthful', 'REQUIRED');
    const legalName = check.text('legalName', body.legalName, L.legalNameMax, 2);
    const docNumber = normalizeDocNumber(body.docType, body.docNumber);
    if (!docNumber) check.fail('docNumber', 'INVALID');
    const address = check.text('address', body.address, L.addressMax, 5);
    const phones: string[] = [];
    body.phones.forEach((raw, i) => {
      const phone = cleanText(raw);
      if (!phone) return;
      if (phone.length > L.phoneMax || !isValidPhone(phone)) check.fail(`phones[${i}]`, 'INVALID');
      else if (!phones.includes(phone)) phones.push(phone);
    });
    if (!phones.length && !Object.keys(check.errors).some((k) => k.startsWith('phones'))) check.fail('phones', 'REQUIRED');
    check.assert();

    const current = await this.prisma.djLegalInfo.findUnique({ where: { profileId } });
    const changed = current
      ? (
          [
            ['legalName', current.legalName !== legalName],
            ['docType', current.docType !== body.docType],
            ['docNumber', current.docNumber !== docNumber],
            ['address', current.address !== address],
            ['phones', JSON.stringify(current.phones) !== JSON.stringify(phones)],
          ] as const
        )
          .filter(([, diff]) => diff)
          .map(([name]) => name)
      : ['legalName', 'docType', 'docNumber', 'address', 'phones'];
    if (!changed.length) return toLegalInfoDto(current);

    const row = await this.store.transaction(async (tx) => {
      const saved = await tx.djLegalInfo.upsert({
        where: { profileId },
        create: { profileId, legalName, docType: body.docType, docNumber: docNumber!, address, phones, updatedById: actor.id },
        update: { legalName, docType: body.docType, docNumber: docNumber!, address, phones, updatedById: actor.id },
      });
      await this.store.record(tx, profileId, actor, 'legal_info', {
        targetType: 'DjLegalInfo',
        targetId: saved.id,
        fields: changed,
        ...(actor.asAdmin ? {} : { meta: { declared: true } }),
      });
      return saved;
    });
    return toLegalInfoDto(row);
  }
}
