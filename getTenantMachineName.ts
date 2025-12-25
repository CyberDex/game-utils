export const TENANT_MACHINE_NAMES = ['vatan-game'];

export const TENANT_PARAM_NAME = 'tenantMachineName';

export const getTenantMachineName = (): (typeof TENANT_MACHINE_NAMES)[number] | 'default' => {
  const params = new URLSearchParams(window.location.search);
  const tenant = params.get(TENANT_PARAM_NAME);

  if (tenant && TENANT_MACHINE_NAMES.includes(tenant)) {
    return tenant;
  }

  return 'default';
};
