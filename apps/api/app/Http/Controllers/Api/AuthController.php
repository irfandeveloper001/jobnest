<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\FirebaseAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
            'role' => 'user',
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->serializeUser($user),
            'profile_completed' => $user->isProfileComplete(),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $user->tokens()->delete();
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->serializeUser($user),
            'profile_completed' => $user->isProfileComplete(),
        ]);
    }

    public function firebaseLogin(Request $request, FirebaseAuthService $firebaseAuthService): JsonResponse
    {
        $validated = $request->validate([
            'idToken' => ['nullable', 'string'],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $idToken = trim((string) ($validated['idToken'] ?? $request->bearerToken() ?? ''));
        if ($idToken === '') {
            throw ValidationException::withMessages([
                'idToken' => ['Firebase ID token is required.'],
            ]);
        }

        $decoded = $firebaseAuthService->verifyIdToken($idToken);
        $uid = trim((string) ($decoded['uid'] ?? ''));
        $email = trim((string) ($decoded['email'] ?? ''));
        $nameFromToken = trim((string) ($decoded['name'] ?? ''));
        $displayName = trim((string) ($validated['name'] ?? $nameFromToken ?? ''));

        if ($uid === '') {
            throw ValidationException::withMessages([
                'idToken' => ['Firebase token does not include a valid UID.'],
            ]);
        }

        if ($email === '') {
            throw ValidationException::withMessages([
                'idToken' => ['Firebase token does not include an email address.'],
            ]);
        }

        $user = User::query()
            ->where('firebase_uid', $uid)
            ->orWhere('email', $email)
            ->first();

        if (! $user) {
            $user = User::query()->create([
                'name' => $displayName !== '' ? $displayName : Str::before($email, '@'),
                'email' => $email,
                'firebase_uid' => $uid,
                'password' => Hash::make(Str::random(40)),
                'role' => 'user',
            ]);
        } else {
            $changed = false;
            if ($user->firebase_uid !== $uid) {
                $user->firebase_uid = $uid;
                $changed = true;
            }
            if ($user->email !== $email) {
                $user->email = $email;
                $changed = true;
            }
            if ($displayName !== '' && $user->name !== $displayName) {
                $user->name = $displayName;
                $changed = true;
            }
            if ($changed) {
                $user->save();
            }
        }

        $user->tokens()->delete();
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'app_token' => $token,
            'role' => $user->role,
            'user' => $this->serializeUser($user),
            'profile_completed' => $user->isProfileComplete(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();

        if ($token) {
            $token->delete();
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'user' => $this->serializeUser($user),
            'profile_completed' => $user->isProfileComplete(),
        ]);
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'firebase_uid' => $user->firebase_uid,
            'role' => $user->role,
            'phone' => $user->phone,
            'preferred_country_id' => $user->preferred_country_id,
            'preferred_state_id' => $user->preferred_state_id,
            'preferred_city_id' => $user->preferred_city_id,
            'profile_completed' => $user->isProfileComplete(),
            'profile_completed_at' => optional($user->profile_completed_at)->toISOString(),
            'cv_uploaded_at' => optional($user->cv_uploaded_at)->toISOString(),
        ];
    }
}
