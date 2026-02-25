<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\AutoJobSyncJob;
use App\Models\City;
use App\Models\Country;
use App\Models\LocationState;
use App\Models\SyncLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user()
            ->fresh()
            ->loadMissing([
                'preferredCountry:id,name,iso2',
                'preferredState:id,name,state_code,country_id',
                'preferredCity:id,name,state_id,country_id',
            ]);
        $lastSync = SyncLog::query()
            ->where('user_id', $user->id)
            ->latest('ended_at')
            ->value('ended_at');

        return response()->json([
            'data' => [
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'preferred_keywords' => $user->preferred_keywords ?? [],
                'preferred_location' => $user->preferred_location,
                'preferred_country_id' => $user->preferred_country_id,
                'preferred_state_id' => $user->preferred_state_id,
                'preferred_city_id' => $user->preferred_city_id,
                'preferred_country_name' => $user->preferredCountry?->name,
                'preferred_state_name' => $user->preferredState?->name,
                'preferred_city_name' => $user->preferredCity?->name,
                'preferred_job_type' => $user->preferred_job_type,
                'cv_uploaded' => ! empty($user->cv_path),
                'cv_uploaded_at' => optional($user->cv_uploaded_at)->toISOString(),
                'profile_completed' => $user->isProfileComplete(),
                'profile_completed_at' => optional($user->profile_completed_at)->toISOString(),
                'last_sync_at' => $lastSync ? Carbon::parse($lastSync)->toISOString() : null,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['nullable', 'string', 'max:50'],
            'preferred_keywords' => ['nullable'],
            'preferred_keywords.*' => ['nullable', 'string', 'max:80'],
            'preferred_country_id' => ['nullable', 'integer', 'exists:countries,id'],
            'preferred_state_id' => ['nullable', 'integer', 'exists:states,id'],
            'preferred_city_id' => ['nullable', 'integer', 'exists:cities,id'],
            'preferred_job_type' => ['nullable', 'in:full-time,contract,part-time,internship,any'],
        ]);

        $user = $request->user();
        $keywords = $this->normalizeKeywords($request->input('preferred_keywords', []));
        [$country, $state, $city] = $this->resolveLocation(
            $validated['preferred_country_id'] ?? null,
            $validated['preferred_state_id'] ?? null,
            $validated['preferred_city_id'] ?? null
        );
        $locationLabel = $this->buildLocationLabel($country?->name, $state?->name, $city?->name);

        $user->fill([
            'phone' => $validated['phone'] ?? null,
            'preferred_keywords' => $keywords,
            'preferred_country_id' => $country?->id,
            'preferred_state_id' => $state?->id,
            'preferred_city_id' => $city?->id,
            'preferred_location' => $locationLabel,
            'preferred_job_type' => $validated['preferred_job_type'] ?? null,
        ]);

        $becameComplete = false;
        if ($this->isCompletePayload($user) && empty($user->profile_completed_at)) {
            $user->profile_completed_at = now();
            $becameComplete = true;
        }

        if (! $this->isCompletePayload($user)) {
            $user->profile_completed_at = null;
        }

        $user->save();

        if ($becameComplete) {
            AutoJobSyncJob::dispatch($user->id)->onQueue('default');
        }

        return response()->json([
            'message' => 'Profile saved successfully.',
            'data' => [
                'profile_completed' => $user->isProfileComplete(),
                'profile_completed_at' => optional($user->profile_completed_at)->toISOString(),
            ],
        ]);
    }

    public function uploadCv(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'cv_file' => ['required', 'file', 'mimes:pdf,doc,docx', 'max:5120'],
        ]);

        $user = $request->user();
        if (! empty($user->cv_path)) {
            Storage::disk('app')->delete($user->cv_path);
        }

        $path = $validated['cv_file']->store('cvs/'.$user->id, 'app');
        $user->cv_path = $path;
        $user->cv_uploaded_at = now();

        if ($this->isCompletePayload($user) && empty($user->profile_completed_at)) {
            $user->profile_completed_at = now();
        }

        $user->save();

        AutoJobSyncJob::dispatch($user->id)->onQueue('default');

        return response()->json([
            'message' => 'CV uploaded successfully.',
            'data' => $this->cvMeta($user),
        ]);
    }

    public function cv(Request $request): JsonResponse
    {
        $user = $request->user();
        return response()->json([
            'data' => $this->cvMeta($user),
        ]);
    }

    public function deleteCv(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! empty($user->cv_path)) {
            Storage::disk('app')->delete($user->cv_path);
        }

        $user->cv_path = null;
        $user->cv_uploaded_at = null;
        $user->profile_completed_at = null;
        $user->save();

        return response()->json([
            'message' => 'CV removed.',
        ]);
    }

    private function normalizeKeywords(mixed $value): array
    {
        if (is_string($value)) {
            $parts = preg_split('/[,\n]+/', $value) ?: [];
            return collect($parts)
                ->map(fn ($item) => trim((string) $item))
                ->filter()
                ->map(fn ($item) => Str::lower($item))
                ->unique()
                ->values()
                ->all();
        }

        if (is_array($value)) {
            return collect($value)
                ->map(fn ($item) => trim((string) $item))
                ->filter()
                ->map(fn ($item) => Str::lower($item))
                ->unique()
                ->values()
                ->all();
        }

        return [];
    }

    private function isCompletePayload($user): bool
    {
        return ! empty($user->phone)
            && ! empty($user->preferred_country_id)
            && ! empty($user->preferred_state_id)
            && ! empty($user->preferred_city_id)
            && ! empty($user->preferred_job_type)
            && is_array($user->preferred_keywords)
            && count(array_filter($user->preferred_keywords)) > 0
            && ! empty($user->cv_path);
    }

    private function resolveLocation(?int $countryId, ?int $stateId, ?int $cityId): array
    {
        $country = $countryId ? Country::query()->find($countryId) : null;
        $state = $stateId ? LocationState::query()->find($stateId) : null;
        $city = $cityId ? City::query()->find($cityId) : null;

        if (($state || $city) && ! $country) {
            throw ValidationException::withMessages([
                'preferred_country_id' => ['Please select a valid country for the selected state/city.'],
            ]);
        }

        if ($state && $country && (int) $state->country_id !== (int) $country->id) {
            throw ValidationException::withMessages([
                'preferred_state_id' => ['Selected state does not belong to the selected country.'],
            ]);
        }

        if ($city && ! $state) {
            throw ValidationException::withMessages([
                'preferred_state_id' => ['Please select a valid state for the selected city.'],
            ]);
        }

        if ($city && $state && (int) $city->state_id !== (int) $state->id) {
            throw ValidationException::withMessages([
                'preferred_city_id' => ['Selected city does not belong to the selected state.'],
            ]);
        }

        if ($city && $country && (int) $city->country_id !== (int) $country->id) {
            throw ValidationException::withMessages([
                'preferred_city_id' => ['Selected city does not belong to the selected country.'],
            ]);
        }

        return [$country, $state, $city];
    }

    private function buildLocationLabel(?string $country, ?string $state, ?string $city): ?string
    {
        $parts = array_values(array_filter([
            $city ? trim($city) : null,
            $state ? trim($state) : null,
            $country ? trim($country) : null,
        ]));

        if (empty($parts)) {
            return null;
        }

        return implode(', ', $parts);
    }

    private function cvMeta($user): ?array
    {
        if (empty($user->cv_path)) {
            return null;
        }

        $size = Storage::disk('app')->exists($user->cv_path)
            ? Storage::disk('app')->size($user->cv_path)
            : null;

        return [
            'filename' => basename($user->cv_path),
            'size_bytes' => $size,
            'uploaded_at' => optional($user->cv_uploaded_at)->toISOString(),
        ];
    }
}
