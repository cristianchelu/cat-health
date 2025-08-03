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

export default function PetList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['pets'],
    queryFn: getPets,
  });

  if (isLoading) return <div className="pet-list"><div className="loading">Loading...</div></div>;
  if (error) return <div className="pet-list"><div className="error">Error loading pets.</div></div>;
  if (!Array.isArray(data)) return <div className="pet-list"><div className="empty">No pets found.</div></div>;

  return (
    <div className="pet-list">
      <h2 className="title">Pet List</h2>
      <div className="grid">
        {data?.map((pet) => (
          <Link key={pet.id} to={`/pets/${pet.id}`} className="card-link">
            <div className="card">
              <div className="card-title">{pet.name}</div>
              <div className="card-content">
                <div><b>Breed:</b> {pet.breed}</div>
                <div><b>Birth Date:</b> {pet.birth_date}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
