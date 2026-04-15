import { useParams } from 'react-router-dom';

export function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  return (
    <div>
      <h1 className="text-lg font-semibold">Reader</h1>
      <p className="text-sm text-muted-foreground">Chapter: {chapterId ?? '(none)'}</p>
    </div>
  );
}
