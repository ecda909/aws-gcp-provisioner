{{/*
Expand the name of the chart.
*/}}
{{- define "aws-gcp-provisioner.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "aws-gcp-provisioner.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "aws-gcp-provisioner.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "aws-gcp-provisioner.labels" -}}
helm.sh/chart: {{ include "aws-gcp-provisioner.chart" . }}
{{ include "aws-gcp-provisioner.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "aws-gcp-provisioner.selectorLabels" -}}
app.kubernetes.io/name: {{ include "aws-gcp-provisioner.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "aws-gcp-provisioner.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "aws-gcp-provisioner.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the database connection string
*/}}
{{- define "aws-gcp-provisioner.databaseUrl" -}}
{{- if .Values.database.external }}
postgresql://{{ .Values.database.externalUsername }}:{{ .Values.database.externalPassword }}@{{ .Values.database.externalHost }}:{{ .Values.database.externalPort }}/{{ .Values.database.externalDatabase }}
{{- else }}
postgresql://{{ .Values.database.internal.username }}:{{ .Values.database.internal.password }}@{{ include "aws-gcp-provisioner.fullname" . }}-db:5432/{{ .Values.database.internal.database }}
{{- end }}
{{- end }}
