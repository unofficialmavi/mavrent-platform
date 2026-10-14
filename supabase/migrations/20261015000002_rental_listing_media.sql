-- Public listing media bucket. Unlike maintenance evidence, these files are
-- intentionally public because they appear on published rental advertisements.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rental-listing-media', 'rental-listing-media', true, 52428800, array['image/*','video/*'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['image/*','video/*'];

drop policy if exists "platform_listing_media_upload_owner" on storage.objects;
create policy "platform_listing_media_upload_owner" on storage.objects for insert to authenticated
with check (
  bucket_id = 'rental-listing-media'
  and (storage.foldername(name))[3] = auth.uid()::text
  and exists (
    select 1 from public.properties p
    join public.units u on u.property_id = p.id
    where p.id::text = (storage.foldername(name))[1]
      and u.id::text = (storage.foldername(name))[2]
      and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())
  )
);

drop policy if exists "platform_listing_media_delete_owner" on storage.objects;
create policy "platform_listing_media_delete_owner" on storage.objects for delete to authenticated
using (
  bucket_id = 'rental-listing-media'
  and (storage.foldername(name))[3] = auth.uid()::text
  and exists (
    select 1 from public.properties p
    join public.units u on u.property_id = p.id
    where p.id::text = (storage.foldername(name))[1]
      and u.id::text = (storage.foldername(name))[2]
      and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())
  )
);

commit;
