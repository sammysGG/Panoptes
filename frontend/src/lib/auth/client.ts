'use client';

import type { User } from '@/types/user';
import { api, clearToken, getToken, setToken } from '@/lib/api';

// Panoptes auth client — backed by the real backend (JWT). The template's
// email/password shape is preserved, but the "email" field carries the username.

export interface SignUpParams {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface SignInWithOAuthParams {
  provider: 'google' | 'discord';
}

export interface SignInWithPasswordParams {
  email: string; // treated as username
  password: string;
}

export interface ResetPasswordParams {
  email: string;
}

class AuthClient {
  async signUp(_: SignUpParams): Promise<{ error?: string }> {
    return { error: 'Self sign-up is disabled. Ask an administrator to create your account.' };
  }

  async signInWithOAuth(_: SignInWithOAuthParams): Promise<{ error?: string }> {
    return { error: 'Social authentication is not supported.' };
  }

  async signInWithPassword(params: SignInWithPasswordParams): Promise<{ error?: string }> {
    try {
      const { token } = await api.post<{ token: string }>('/api/auth/login', {
        username: params.email,
        password: params.password,
      });
      setToken(token);
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid credentials' };
    }
  }

  async resetPassword(_: ResetPasswordParams): Promise<{ error?: string }> {
    return { error: 'Password reset is not available. Contact your administrator.' };
  }

  async updatePassword(_: ResetPasswordParams): Promise<{ error?: string }> {
    return { error: 'Not implemented' };
  }

  async getUser(): Promise<{ data?: User | null; error?: string }> {
    if (!getToken()) return { data: null };
    try {
      const { user } = await api.get<{ user: { id: number; username: string } }>('/api/auth/me');
      return {
        data: {
          id: String(user.id),
          name: user.username,
          email: user.username,
        } satisfies User,
      };
    } catch {
      clearToken();
      return { data: null };
    }
  }

  async signOut(): Promise<{ error?: string }> {
    clearToken();
    return {};
  }
}

export const authClient = new AuthClient();
