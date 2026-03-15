# AgentOps Classroom

GitHub Pages로 공개하는 PDF 중심 교육 저장소입니다. 목표는 QA 비개발 직군이 Agent AI 기반 QA 자동화 툴을 이해하고 일상 운영 및 1차 대응까지 수행할 수 있도록 만드는 것입니다.

## Public URL

- Pages base URL: `https://iantoo2.github.io/AgentOps-Classroom/`
- Handbook PDF: `https://iantoo2.github.io/AgentOps-Classroom/pdf/agentops-classroom-handbook.pdf`
- Runbook PDF: `https://iantoo2.github.io/AgentOps-Classroom/pdf/agentops-classroom-runbook.pdf`

## Repository Layout

- `index.html`: PDF 링크를 제공하는 GitHub Pages 랜딩 페이지
- `pdf/`: 배포되는 PDF 파일
- `src/content/`: PDF 원본 콘텐츠
- `scripts/build-pdfs.mjs`: PDF 생성 스크립트
- `assets/fonts/`: PDF 생성용 폰트 파일
- `.github/workflows/deploy-pages.yml`: Pages 자동 배포 워크플로

## Local Workflow

```bash
npm install
npm run build
```

PDF를 갱신하려면 `src/content/*`를 수정한 뒤 `npm run build`를 실행하면 됩니다.

## Publishing

이 저장소는 GitHub Actions 기반 Pages 배포를 사용합니다. 저장소 설정에서 `Settings > Pages > Source`를 `GitHub Actions`로 설정해야 합니다.
