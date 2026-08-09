import * as React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/PageState';
import './RecognitionStateCard.css';

interface RecognitionStateCardProps {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}

/**
 * The card shared by the Recognition tab's gate states (locked, empty):
 * a centered icon circle, a title, and whatever CTA the caller passes as
 * children. Layout mirrors the Camera tab's empty state.
 */
const RecognitionStateCard: React.FC<RecognitionStateCardProps> = ({
  icon,
  title,
  children,
}) => {
  return (
    <Card>
      <CardContent>
        <EmptyState className="recognition-state-card">
          <span className="recognition-state-icon" aria-hidden="true">
            {icon}
          </span>
          <p className="recognition-state-title">{title}</p>
          {children}
        </EmptyState>
      </CardContent>
    </Card>
  );
};

export { RecognitionStateCard, type RecognitionStateCardProps };
