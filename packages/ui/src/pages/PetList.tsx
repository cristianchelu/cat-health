import { Link } from 'react-router';
import { usePets } from '@/hooks/queries/petQueries';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';

import './PetList.css';

// Helper function to calculate age from birth date
function calculateAge(birthDate: string): string {
  const today = new Date();
  const birth = new Date(birthDate);

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();

  // Adjust years and months if birth month is ahead of current month
  if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }

  // Format the result based on age
  if (years > 0) {
    return `${years} year${years !== 1 ? 's' : ''}`;
  } else {
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
}

export default function PetList() {
  const { data, isLoading, error } = usePets();

  if (isLoading)
    return (
      <div className="pet-list">
        <div className="loading">Loading...</div>
      </div>
    );
  if (error)
    return (
      <div className="pet-list">
        <div className="error">Error loading pets.</div>
      </div>
    );
  if (!Array.isArray(data))
    return (
      <div className="pet-list">
        <div className="empty">No pets found.</div>
      </div>
    );

  return (
    <div className="pet-list">
      <h2>Your pets</h2>
      <div className="grid">
        {data?.map((pet) => (
          <Link key={pet.id} to={`/pets/${pet.id}`} className="card-link">
            <Card>
              <CardHeader>
                <CardTitle>{pet.name}</CardTitle>
                <CardDescription>{pet.breed}</CardDescription>
              </CardHeader>
              <CardContent className="details">
                <p>
                  <b>Birth Date:</b>{' '}
                  {new Date(pet.birth_date).toLocaleDateString()}
                </p>
                <p>
                  <b>Age:</b> {calculateAge(pet.birth_date)}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
