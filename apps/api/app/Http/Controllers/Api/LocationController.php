<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\City;
use App\Models\Country;
use App\Models\LocationState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    public function countries(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:80'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $query = Country::query()->select(['id', 'name', 'iso2']);

        if (! empty($validated['q'])) {
            $q = trim($validated['q']);
            $query->where('name', 'like', "%{$q}%");
        }

        $limit = (int) ($validated['limit'] ?? 250);

        $countries = $query
            ->orderBy('name')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $countries,
        ]);
    }

    public function states(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'country_id' => ['required', 'integer', 'exists:countries,id'],
            'q' => ['nullable', 'string', 'max:80'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
        ]);

        $query = LocationState::query()
            ->select(['id', 'name', 'state_code', 'country_id'])
            ->where('country_id', $validated['country_id']);

        if (! empty($validated['q'])) {
            $q = trim($validated['q']);
            $query->where('name', 'like', "%{$q}%");
        }

        $limit = (int) ($validated['limit'] ?? 500);

        $states = $query
            ->orderBy('name')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $states,
        ]);
    }

    public function cities(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'state_id' => ['required', 'integer', 'exists:states,id'],
            'q' => ['nullable', 'string', 'max:80'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1500'],
        ]);

        $query = City::query()
            ->select(['id', 'name', 'state_id', 'country_id'])
            ->where('state_id', $validated['state_id']);

        if (! empty($validated['q'])) {
            $q = trim($validated['q']);
            $query->where('name', 'like', "%{$q}%");
        }

        $limit = (int) ($validated['limit'] ?? 1000);

        $cities = $query
            ->orderBy('name')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $cities,
        ]);
    }
}
