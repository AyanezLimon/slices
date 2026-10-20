-- Subir con upsert necesita poder leer la fila existente en storage.objects;
-- sin esta política la subida falla con "new row violates row-level security policy".
create policy "ver avatares" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
