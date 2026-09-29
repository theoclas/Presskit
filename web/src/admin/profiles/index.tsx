import { Route, Routes } from 'react-router';
import { ProfileEditorPage } from './ProfileEditorPage';
import { ProfilesListPage } from './ProfilesListPage';
import { useSplatBase } from './useSplatBase';

/**
 * /admin/djs/* — lista de perfiles y editor de cada uno (/admin/djs/:id/<pestaña>).
 * AdminApp lo carga en un chunk aparte y lo envuelve en ConfigProvider, App y StepUpProvider.
 */
export function ProfilesSection() {
  const listPath = useSplatBase();
  return (
    <Routes>
      <Route index element={<ProfilesListPage listPath={listPath} />} />
      <Route path=":id/*" element={<ProfileEditorPage listPath={listPath} />} />
    </Routes>
  );
}

export default ProfilesSection;
