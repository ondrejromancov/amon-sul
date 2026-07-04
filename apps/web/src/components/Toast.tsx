import './toast.css';

export function Toast({ message }: { message: string | null }) {
  return (
    <div id="toast" className={message ? 'show' : ''} role="status">
      {message}
    </div>
  );
}
