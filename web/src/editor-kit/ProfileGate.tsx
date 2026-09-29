import type { EditorProfileDto } from '@fersua/shared';
import { Alert, Button, Skeleton } from 'antd';
import type { ReactNode } from 'react';
import { describeError, useEditorProfile } from './api';

/** Carga el perfil del editor y pinta la sección cuando llega (con estados de carga y error). */
export function ProfileGate({ children }: { children: (profile: EditorProfileDto) => ReactNode }) {
  const query = useEditorProfile();
  if (query.isPending) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (query.isError) {
    const e = describeError(query.error);
    return (
      <Alert
        type="error"
        showIcon
        title={e.statusCode === 404 ? 'Este perfil no existe o ya fue borrado.' : e.message}
        action={
          e.statusCode === 404 ? undefined : (
            <Button size="small" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          )
        }
      />
    );
  }
  return <>{children(query.data)}</>;
}
