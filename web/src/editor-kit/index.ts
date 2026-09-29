// Piezas del editor de perfiles compartidas por el admin (M2) y el panel del DJ (M3).
// El panel monta las mismas secciones con <EditorScopeProvider base="/me/profile" actor="owner">.

export { EditorScopeProvider, editorKeys, useEditorScope, type EditorScope } from './scope';
export { describeError, useAfterSave, useEditorProfile } from './api';
export { ProfileGate } from './ProfileGate';
export { UnsavedChangesProvider, useUnsavedChanges } from './unsaved';
export { ImageUploader, type ImageUploaderProps } from './ImageUploader';
export { ImageThumb, MediaUsage, editorImageUrl } from './media';
export { SortableList, MoveButtons, moveItem } from './SortableList';
export { SocialLinksEditor, checkSocialInput, validateSocialRows } from './SocialLinksEditor';
export { FormConfigEditor, formConfigIssues } from './FormConfigEditor';
export { PalettePicker } from './PalettePicker';
export { TextSlotField, textSlotProblem } from './TextSlotField';
export { PROFILE_STATUS_COLORS, PROFILE_STATUS_LABELS } from './labels';

export { ProfileSection } from './sections/ProfileSection';
export { PhotosSection } from './sections/PhotosSection';
export { MembersSection } from './sections/MembersSection';
export { EventsSection } from './sections/EventsSection';
export { RiderSection } from './sections/RiderSection';
export { SocialsSection } from './sections/SocialsSection';
export { BookingFormSection } from './sections/BookingFormSection';
export { LegalInfoSection } from './sections/LegalInfoSection';
