import { useEffect, useState } from 'react';
import { getClient, type Presenter } from './client';

/** Live, position-sorted presenter queue. */
export function usePresenters() {
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sub = getClient().models.Presenter.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        setPresenters([...items].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)));
        if (isSynced) setLoaded(true);
      },
      error: (err) => console.error('Presenter subscription error', err),
    });
    return () => sub.unsubscribe();
  }, []);

  return { presenters, loaded };
}

/** Persist a new order: writes `position` only for rows whose index changed. */
export async function saveOrder(ordered: Presenter[]) {
  const client = getClient();
  await Promise.all(
    ordered.map((p, i) =>
      p.position === i ? null : client.models.Presenter.update({ id: p.id, position: i }),
    ),
  );
}
