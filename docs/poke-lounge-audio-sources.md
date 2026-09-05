# Poke Lounge Audio Sources

현재 Poke Lounge 런타임의 BGM 2개와 효과음 6개는 로컬 Pokémon HeartGold 한국어 ROM의
`data/sound/gs_sound_data.sdat`에서 렌더링한 MP3입니다. 원본 ROM과 중간 산출물은 공개
자산이 아니며, 이 문서는 기술적 출처와 재생성 경로만 기록합니다.

이 기록은 사용·배포 권한, 라이선스, 상표 또는 법적 허가를 확인하거나 부여하지 않습니다.
각 파일의 배포 권리는 해결되지 않은 상태이며, 공개 배포 전에는 릴리스 소유자의 명시적
결정과 필요한 검토가 필요합니다.

## 렌더링 경로

- 로컬 게임 원본 입력: ignored 데이터 영역의 HeartGold 한국어 원본 파일
- SDAT 입력: `data/sound/gs_sound_data.sdat`
- 큐 정의: `scripts/poke-lounge/audio-cues.json`
- 렌더러: `scripts/poke-lounge/render-audio-cues.py`
- 공개 출력: `apps/web/public/assets/poke-lounge/audio/`

로컬 게임 원본, 원본 데이터 파서, `ffmpeg`가 준비된 환경에서만 다음 명령으로 전체 파이프라인을 다시
실행할 수 있습니다.

```bash
python3 scripts/poke-lounge/render-audio-cues.py --mode all
```

렌더러는 시퀀스별 WAV를 `data/processed/poke-lounge-audio/wav/`에 만들고, 정규화 후
브라우저 재생용 MP3와 `audio-manifest.json`을 생성합니다. BGM에서는 SDAT의 시작 트랙,
점프, 호출, 복귀 제어 흐름을 실행해 병렬 트랙을 함께 렌더링합니다. SDAT 시퀀스 정보는
런타임 매니페스트에도 함께 기록됩니다.

## 런타임 매핑

| Runtime ID          | Kind | SDAT sequence                 | Public output               |
| ------------------- | ---- | ----------------------------- | --------------------------- |
| `field-day`         | BGM  | `1028` `SEQ_GS_R_1_29`        | `bgm/field-day.mp3`         |
| `wild-battle`       | BGM  | `1116` `SEQ_GS_VS_NORAPOKE`   | `bgm/wild-battle.mp3`       |
| `button-confirm`    | SFX  | `1394` `SEQ_SE_PL_BUTTON`     | `sfx/button-confirm.mp3`    |
| `button-cancel`     | SFX  | `2368` `SEQ_SE_GS_GEARCANCEL` | `sfx/button-cancel.mp3`     |
| `battle-transition` | SFX  | `1390` `SEQ_SE_PL_WARP`       | `sfx/battle-transition.mp3` |
| `battle-start`      | SFX  | `1815` `SEQ_SE_DP_VSDEMO03`   | `sfx/battle-start.mp3`      |
| `battle-hit`        | SFX  | `2256` `SEQ_SE_GS_TACKLEHIT`  | `sfx/battle-hit.mp3`        |
| `pokemon-faint`     | SFX  | `1796` `SEQ_SE_DP_HINSI`      | `sfx/pokemon-faint.mp3`     |
