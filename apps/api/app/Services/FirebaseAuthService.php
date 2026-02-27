<?php

namespace App\Services;

use Illuminate\Support\Str;
use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;
use Kreait\Firebase\Exception\FirebaseException;
use Kreait\Firebase\Factory;
use Kreait\Firebase\Contract\Auth;
use RuntimeException;
use Throwable;

class FirebaseAuthService
{
    private ?Auth $auth = null;

    public function verifyIdToken(string $idToken): array
    {
        $idToken = trim($idToken);
        if ($idToken === '') {
            throw new RuntimeException('Firebase ID token is required.');
        }

        try {
            $verifiedToken = $this->getAuth()->verifyIdToken($idToken);
            $claims = $verifiedToken->claims();

            return [
                'uid' => (string) $claims->get('sub'),
                'email' => $claims->get('email') ? (string) $claims->get('email') : null,
                'name' => $claims->get('name') ? (string) $claims->get('name') : null,
            ];
        } catch (FailedToVerifyToken $exception) {
            throw new RuntimeException('Invalid Firebase token.');
        } catch (FirebaseException $exception) {
            throw new RuntimeException('Unable to verify Firebase token.');
        } catch (Throwable $exception) {
            throw new RuntimeException('Unable to verify Firebase token.');
        }
    }

    private function getAuth(): Auth
    {
        if ($this->auth) {
            return $this->auth;
        }

        $serviceAccount = trim((string) config('services.firebase.service_account_json', ''));
        if ($serviceAccount === '') {
            throw new RuntimeException('Firebase service account is not configured.');
        }

        $factory = new Factory();

        if (Str::startsWith($serviceAccount, '{')) {
            $decoded = json_decode($serviceAccount, true);
            if (! is_array($decoded)) {
                throw new RuntimeException('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON.');
            }
            $factory = $factory->withServiceAccount($decoded);
        } else {
            $path = Str::startsWith($serviceAccount, ['/']) ? $serviceAccount : base_path($serviceAccount);
            if (! file_exists($path)) {
                throw new RuntimeException("Firebase service account file not found at: {$path}");
            }
            $factory = $factory->withServiceAccount($path);
        }

        $projectId = trim((string) config('services.firebase.project_id', ''));
        if ($projectId !== '') {
            $factory = $factory->withProjectId($projectId);
        }

        $this->auth = $factory->createAuth();

        return $this->auth;
    }
}
