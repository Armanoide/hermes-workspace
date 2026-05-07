import { useQuery } from '@tanstack/react-query'

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/profiles/list')
      const data = await res.json()
      return data.profiles ?? []
    },
    staleTime: 60_000,
  })
}
