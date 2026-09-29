import { App, message as staticMessage, Modal } from 'antd';

type AppApi = ReturnType<typeof App.useApp>;

/**
 * message y modal del <App> de AntD (heredan tema y locale). Si el editor se monta fuera de un
 * <App>, el contexto llega vacío: se usan los métodos estáticos para no romper.
 */
export function useFeedback(): { message: AppApi['message']; modal: AppApi['modal'] } {
  const app = App.useApp();
  const message = typeof app.message?.success === 'function' ? app.message : staticMessage;
  const modal = typeof app.modal?.confirm === 'function' ? app.modal : (Modal as unknown as AppApi['modal']);
  return { message, modal };
}

export const SAVED_MESSAGE = 'Cambios guardados';
