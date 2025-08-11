import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getPets } from '@/api/pets';
import './pet-list.css';

export type Pet = {
  id: number;
  name: string;
  breed: string;
  birth_date: string;
};

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
  const { data, isLoading, error } = useQuery({
    queryKey: ['pets'],
    queryFn: getPets,
  });

  if (isLoading) return <div className="pet-list"><div className="loading">Loading...</div></div>;
  if (error) return <div className="pet-list"><div className="error">Error loading pets.</div></div>;
  if (!Array.isArray(data)) return <div className="pet-list"><div className="empty">No pets found.</div></div>;

  return (
    <div className="container">
      <div className="section">
        <div className="section-header">
          <h1>Your Pets</h1>
          <p>View and manage your pet health information</p>
        </div>
        
        <div className="card-grid">
          {data?.map((pet) => (
            <Link key={pet.id} to={`/pets/${pet.id}`} className="card-link">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">{pet.name}</div>
                  <div className="card-description">{pet.breed}</div>
                </div>
                <div className="card-content">
                  <div className="pet-details">
                    <p><b>Birth Date:</b> {new Date(pet.birth_date).toLocaleDateString()}</p>
                    <p><b>Age:</b> {calculateAge(pet.birth_date)}</p>
                  </div>
                </div>
                <div className="card-footer">
                  <span className="view-details">View Details →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
