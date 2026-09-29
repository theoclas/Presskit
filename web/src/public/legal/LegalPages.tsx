import { DEFAULT_PALETTE, LEGAL_DOCS, SLUG_RE, formatLongDate, isValidDateOnly } from '@fersua/shared';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { usePalette } from '../../lib/palette';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { SiteNav } from '../components/SiteNav';
import { PublicShell } from '../layouts/PublicShell';
import { LEGAL_CONTENT, reportPage } from './content';
import { LegalDocView } from './LegalDocView';
import { TicketForm } from './TicketForm';
import type { LegalDoc } from './types';
import './legal.css';

// Chunk diferido: los textos legales no pesan en la carga de las páginas de los DJs.

const legalNav = (
  <SiteNav
    tag="Legal"
    links={[
      { href: '/', label: 'Artistas' },
      { href: '/pqrs', label: 'PQRS' },
    ]}
  />
);

function versionLine(key: LegalDoc['key'], updatedAt: string): string {
  const date = isValidDateOnly(updatedAt) ? formatLongDate(updatedAt) : updatedAt;
  return `Versión ${LEGAL_DOCS[key].version} · Última actualización: ${date}`;
}

function LegalDocPage({ docKey, children }: { docKey: LegalDoc['key']; children?: ReactNode }) {
  const doc = LEGAL_CONTENT[docKey];
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`${doc.title} · ${SITE_NAME}`);
  return (
    <PublicShell nav={legalNav}>
      <LegalDocView title={doc.title} meta={versionLine(docKey, doc.updatedAt)} intro={doc.intro} sections={doc.sections} />
      {children}
    </PublicShell>
  );
}

export function PrivacyPage() {
  return <LegalDocPage docKey="privacy" />;
}

export function TermsPage() {
  return <LegalDocPage docKey="terms" />;
}

export function ArtistTermsPage() {
  return <LegalDocPage docKey="artistTerms" />;
}

export function PqrsPage() {
  return (
    <LegalDocPage docKey="pqrs">
      <section className="legal-form" aria-labelledby="pqrs-form-title">
        <h2 className="sec-title" id="pqrs-form-title">
          Envía tu solicitud
        </h2>
        <div className="sec-sub">Te respondemos por correo dentro de los plazos de ley.</div>
        <TicketForm mode="pqrs" />
      </section>
    </LegalDocPage>
  );
}

export function ReportPage() {
  const [params] = useSearchParams();
  const raw = (params.get('perfil') ?? '').trim().toLowerCase();
  const slug = SLUG_RE.test(raw) ? raw : '';
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`${reportPage.title} · ${SITE_NAME}`);
  return (
    <PublicShell nav={legalNav}>
      <LegalDocView title={reportPage.title} intro={reportPage.intro} sections={reportPage.sections} />
      <section className="legal-form" aria-labelledby="report-form-title">
        <h2 className="sec-title" id="report-form-title">
          {slug ? `Reportar el perfil /${slug}` : 'Enviar reporte'}
        </h2>
        <div className="sec-sub">Revisamos cada reporte y te respondemos por correo.</div>
        <TicketForm key={slug} mode="report" initialSlug={slug} />
      </section>
    </PublicShell>
  );
}
