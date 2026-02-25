<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class LocationsSeeder extends Seeder
{
    private const SOURCES = [
        'countries' => 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json',
        'states' => 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/states.json',
        'cities' => 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/cities.json',
    ];

    public function run(): void
    {
        // The cities dataset is large; raise memory ceiling for seed runtime.
        @ini_set('memory_limit', '1024M');

        $countries = $this->loadDataset('countries');
        $states = $this->loadDataset('states');
        $cities = $this->loadDataset('cities');

        $this->seedCountries($countries);
        $this->seedStates($states);
        $this->seedCities($cities);

        $this->command?->info('LocationsSeeder completed: countries, states, and cities imported.');
    }

    private function loadDataset(string $name): array
    {
        $disk = Storage::disk('local');
        $relativePath = "location-seeds/{$name}.json";

        if (! $disk->exists($relativePath)) {
            $url = self::SOURCES[$name] ?? null;
            if (! $url) {
                throw new RuntimeException("No source configured for dataset [{$name}].");
            }

            $this->command?->info("Downloading {$name}.json from {$url}");
            $response = Http::timeout(180)
                ->retry(3, 1200)
                ->get($url);

            if (! $response->ok()) {
                throw new RuntimeException("Failed to download {$name}.json (HTTP {$response->status()}).");
            }

            $disk->put($relativePath, $response->body());
        }

        $decoded = json_decode($disk->get($relativePath), true);
        if (! is_array($decoded)) {
            throw new RuntimeException("Invalid JSON payload for dataset [{$name}].");
        }

        return $decoded;
    }

    private function seedCountries(array $rows): void
    {
        $now = now();
        $count = 0;
        foreach (array_chunk($rows, 500) as $part) {
            $payload = [];
            foreach ($part as $row) {
                $id = (int) Arr::get($row, 'id');
                $name = trim((string) Arr::get($row, 'name', ''));
                if ($id <= 0 || $name === '') {
                    continue;
                }

                $payload[] = [
                    'id' => $id,
                    'name' => $name,
                    'iso2' => strtoupper((string) Arr::get($row, 'iso2', '')) ?: null,
                    'iso3' => strtoupper((string) Arr::get($row, 'iso3', '')) ?: null,
                    'phonecode' => (string) Arr::get($row, 'phonecode', '') ?: null,
                    'emoji' => (string) Arr::get($row, 'emoji', '') ?: null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            if (empty($payload)) {
                continue;
            }

            DB::table('countries')->upsert(
                $payload,
                ['id'],
                ['name', 'iso2', 'iso3', 'phonecode', 'emoji', 'updated_at']
            );
            $count += count($payload);
        }

        $this->command?->info('Countries imported: '.$count);
    }

    private function seedStates(array $rows): void
    {
        $now = now();
        $count = 0;
        foreach (array_chunk($rows, 1000) as $part) {
            $payload = [];
            foreach ($part as $row) {
                $id = (int) Arr::get($row, 'id');
                $name = trim((string) Arr::get($row, 'name', ''));
                if ($id <= 0 || $name === '') {
                    continue;
                }

                $payload[] = [
                    'id' => $id,
                    'name' => $name,
                    'country_id' => Arr::get($row, 'country_id') ? (int) Arr::get($row, 'country_id') : null,
                    'country_iso2' => strtoupper((string) Arr::get($row, 'country_code', '')) ?: null,
                    'state_code' => strtoupper((string) Arr::get($row, 'state_code', '')) ?: null,
                    'type' => (string) Arr::get($row, 'type', '') ?: null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            if (empty($payload)) {
                continue;
            }

            DB::table('states')->upsert(
                $payload,
                ['id'],
                ['name', 'country_id', 'country_iso2', 'state_code', 'type', 'updated_at']
            );
            $count += count($payload);
        }

        $this->command?->info('States imported: '.$count);
    }

    private function seedCities(array $rows): void
    {
        $now = now();
        $count = 0;
        foreach (array_chunk($rows, 1500) as $part) {
            $payload = [];
            foreach ($part as $row) {
                $id = (int) Arr::get($row, 'id');
                $name = trim((string) Arr::get($row, 'name', ''));
                if ($id <= 0 || $name === '') {
                    continue;
                }

                $payload[] = [
                    'id' => $id,
                    'name' => $name,
                    'country_id' => Arr::get($row, 'country_id') ? (int) Arr::get($row, 'country_id') : null,
                    'country_iso2' => strtoupper((string) Arr::get($row, 'country_code', '')) ?: null,
                    'state_id' => Arr::get($row, 'state_id') ? (int) Arr::get($row, 'state_id') : null,
                    'state_code' => strtoupper((string) Arr::get($row, 'state_code', '')) ?: null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            if (empty($payload)) {
                continue;
            }

            DB::table('cities')->upsert(
                $payload,
                ['id'],
                ['name', 'country_id', 'country_iso2', 'state_id', 'state_code', 'updated_at']
            );
            $count += count($payload);
        }

        $this->command?->info('Cities imported: '.$count);
    }
}
