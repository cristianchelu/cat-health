import * as React from 'react';
import { FolderClosed, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '@/components/ui/CardList';

interface PetLifecycleRow {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

interface PetLifecycleSectionProps {
  /** Close while the profile is open, Reopen once it is closed. */
  closeRow: PetLifecycleRow & { closed: boolean };
  deleteRow: PetLifecycleRow;
  disabled?: boolean;
}

/** The profile's way out: close (reversible) above delete (not). */
const PetLifecycleSection: React.FC<PetLifecycleSectionProps> = ({
  closeRow,
  deleteRow,
  disabled = false,
}) => (
  <CardList>
    <CardListItem
      icon={closeRow.closed ? <FolderClosed aria-hidden="true" /> : undefined}
      trailing={
        <Button
          type="button"
          variant="neutral"
          size="sm"
          onClick={closeRow.onAction}
          disabled={disabled}
        >
          {closeRow.actionLabel}
        </Button>
      }
    >
      <CardListContent
        title={closeRow.title}
        description={closeRow.description}
      />
    </CardListItem>
    <CardListItem
      trailing={
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={deleteRow.onAction}
          disabled={disabled}
        >
          <Trash2 size={16} aria-hidden="true" />
          {deleteRow.actionLabel}
        </Button>
      }
    >
      <CardListContent
        title={deleteRow.title}
        description={deleteRow.description}
      />
    </CardListItem>
  </CardList>
);

export { type PetLifecycleSectionProps };
export default PetLifecycleSection;
