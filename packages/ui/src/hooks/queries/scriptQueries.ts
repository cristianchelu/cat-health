import { postMigrate } from "@/api/scripts";
import { useMutation } from "@tanstack/react-query";

export function useMigrateMutation() {
  return useMutation({
    mutationFn: async () => {
      const response = await postMigrate();
      if (!response.ok) throw new Error('Migration failed');
      return response;
    },
  });
}