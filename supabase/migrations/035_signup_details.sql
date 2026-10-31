-- Dados do cadastro: endereço da empresa e como a pessoa conheceu o Krono.
alter table public.workspaces
  add column if not exists address_zip text check (address_zip is null or length(address_zip) <= 9),
  add column if not exists address_street text check (address_street is null or length(address_street) <= 150),
  add column if not exists address_number text check (address_number is null or length(address_number) <= 20),
  add column if not exists address_complement text check (address_complement is null or length(address_complement) <= 80),
  add column if not exists address_district text check (address_district is null or length(address_district) <= 80),
  add column if not exists address_city text check (address_city is null or length(address_city) <= 80),
  add column if not exists address_state text check (address_state is null or address_state ~ '^[A-Z]{2}$'),
  add column if not exists acquisition_source text check (acquisition_source is null or acquisition_source in ('instagram', 'indicacao', 'google', 'workana', 'youtube', 'whatsapp', 'outro'));

grant update (address_zip, address_street, address_number, address_complement, address_district, address_city, address_state, acquisition_source)
  on public.workspaces to authenticated;

notify pgrst, 'reload schema';
