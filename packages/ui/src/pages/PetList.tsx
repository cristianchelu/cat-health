import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPets } from '@/api/pets';

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

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading pets.</div>;
  if (!Array.isArray(data)) return <div>No pets found.</div>;

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {data?.map((pet) => (
        <Card key={pet.id}>
          <CardHeader>
            <CardTitle>{pet.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div>Breed: {pet.breed}</div>
            <div>Birth Date: {pet.birth_date}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
