"""
Translating the same sentence eight ways, over and over.

From a production log: EVERY notification ran the full provider chain — gemini
429, groq 401, openrouter dead, ollama absent (it is a cloud container), openai
out of credit — roughly six seconds of network waiting each, on a single
gunicorn worker. And the same two strings repeatedly, because notification text
is a template:

    "Work Plan Under Revision"
    "The work plan for week 2026-08-09 is being revised..."

Nothing was broken. It was just doing the identical futile work every time.
"""

import time

import pytest

from app.services import translation_service as ts
from app.services.translation_service import TranslationService, reset_translation_cache


@pytest.fixture(autouse=True)
def clean():
    reset_translation_cache()
    yield
    reset_translation_cache()


class TestTheSameSentenceIsTranslatedOnce:
    def test_a_repeat_does_not_call_the_chain_again(self, monkeypatch):
        calls = []
        monkeypatch.setattr(TranslationService, '_translate_uncached',
                            staticmethod(lambda text, lang: calls.append(text) or 'مترجم'))

        first = TranslationService._translate('Work Plan Under Revision', 'ar')
        second = TranslationService._translate('Work Plan Under Revision', 'ar')

        assert first == second == 'مترجم'
        assert len(calls) == 1

    def test_different_text_is_not_confused(self, monkeypatch):
        monkeypatch.setattr(TranslationService, '_translate_uncached',
                            staticmethod(lambda text, lang: f'{lang}:{text}'))

        assert TranslationService._translate('one', 'ar') == 'ar:one'
        assert TranslationService._translate('two', 'ar') == 'ar:two'

    def test_the_target_language_is_part_of_the_key(self, monkeypatch):
        """Otherwise asking for Arabic would return the English answer."""
        monkeypatch.setattr(TranslationService, '_translate_uncached',
                            staticmethod(lambda text, lang: f'{lang}:{text}'))

        assert TranslationService._translate('same', 'ar') == 'ar:same'
        assert TranslationService._translate('same', 'en') == 'en:same'

    def test_a_failure_is_cached_too_but_briefly(self, monkeypatch):
        """A dead chain must not be rediscovered on every single message —
        but a quota that resets should get another chance."""
        calls = []
        monkeypatch.setattr(TranslationService, '_translate_uncached',
                            staticmethod(lambda text, lang: calls.append(text)))

        TranslationService._translate('Work Plan Under Revision', 'ar')
        TranslationService._translate('Work Plan Under Revision', 'ar')

        assert len(calls) == 1
        assert ts._CACHE_TTL_FAIL < ts._CACHE_TTL_OK

    def test_the_cache_is_bounded(self, monkeypatch):
        """A worker runs for days; an unbounded cache is a slow memory leak."""
        monkeypatch.setattr(ts, '_CACHE_MAX', 10)
        monkeypatch.setattr(TranslationService, '_translate_uncached',
                            staticmethod(lambda text, lang: text))

        for i in range(50):
            TranslationService._translate(f'text {i}', 'ar')

        assert len(ts._cache) <= 10

    def test_an_expired_entry_is_retried(self, monkeypatch):
        calls = []
        monkeypatch.setattr(TranslationService, '_translate_uncached',
                            staticmethod(lambda text, lang: calls.append(text) or 'x'))
        TranslationService._translate('hello', 'ar')
        # Force expiry rather than sleeping.
        with ts._cache_lock:
            for key in list(ts._cache):
                value, _ = ts._cache[key]
                ts._cache[key] = (value, time.time() - 1)

        TranslationService._translate('hello', 'ar')

        assert len(calls) == 2


class TestADeadProviderIsNotRetriedImmediately:
    def test_a_failed_provider_is_skipped_for_a_while(self):
        ts._mark_failed('groq')
        assert ts._recently_failed('groq') is True

    def test_a_provider_that_works_is_cleared(self):
        ts._mark_failed('gemini')
        ts._mark_ok('gemini')
        assert ts._recently_failed('gemini') is False

    def test_the_breaker_expires(self, monkeypatch):
        """A 429 quota resets. Skipping forever would turn a rate limit into an
        outage that never heals."""
        monkeypatch.setattr(ts, '_BREAKER_SECONDS', 0)
        ts._mark_failed('openai')
        assert ts._recently_failed('openai') is False

    def test_an_untried_provider_is_not_skipped(self):
        assert ts._recently_failed('deepinfra') is False
