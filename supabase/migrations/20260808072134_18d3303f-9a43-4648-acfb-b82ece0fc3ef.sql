drop policy if exists "own profile" on public.profiles;

create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
for insert to authenticated with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke delete on public.profiles from authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;