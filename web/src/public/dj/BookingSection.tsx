import type { PublicDjProfileDto } from '@fersua/shared';
import { BookingForm } from './BookingForm';

interface Props {
  dj: PublicDjProfileDto;
  preview?: boolean;
}

export function BookingSection({ dj, preview }: Props) {
  const { texts, bookingForm } = dj;
  return (
    <section id="booking" aria-labelledby="booking-title">
      <h2 className="sec-title" id="booking-title">
        {texts.bookingTitle}
      </h2>
      {texts.bookingSubtitle ? <div className="sec-sub">{texts.bookingSubtitle}</div> : null}
      <BookingForm
        slug={dj.slug}
        displayName={dj.displayName}
        fields={bookingForm.fields}
        texts={texts}
        consentText={bookingForm.consentText}
        privacyUrl={bookingForm.privacyUrl}
        portalNotice={bookingForm.portalNotice}
        whatsappUrl={dj.whatsapp.bookingUrl}
        preview={preview}
      />
    </section>
  );
}
