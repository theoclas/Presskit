export function DjFooter({ text }: { text: string }) {
  return (
    <footer>
      © {new Date().getFullYear()} {text}
    </footer>
  );
}
