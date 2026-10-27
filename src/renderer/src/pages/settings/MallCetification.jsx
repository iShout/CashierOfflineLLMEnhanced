import { App as AntdApp, Button, DatePicker, Form, Input, Select, Spin } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const { RangePicker } = DatePicker;

// 商场类型常量：与 Vue 版 MALL 枚举保持一致。
const MALL = {
  SM: 1,
  PARQAL: 2,
  MEGA_WORLD: 3,
};

// 固定商场默认文件目录。Parqal 需要用户选择目录，所以不在这里设置固定路径。
const FILE_MAP = new Map([
  [MALL.SM, "C:\\SIA"],
  [MALL.MEGA_WORLD, "D:\\Megaworld"],
]);

// 商场类型展示名称，用于说明文案和 Select 选项。
const MALL_NAME_MAP = new Map([
  [MALL.SM, "SM Mall"],
  [MALL.PARQAL, "Parqal"],
  [MALL.MEGA_WORLD, "Megaworld"],
]);

// 商场下拉选项：AntD Select 使用 label/value 结构。
const MALL_LIST = [
  {
    value: MALL.SM,
    label: "SM Mall",
  },
  {
    value: MALL.PARQAL,
    label: "Parqal",
  },
  {
    value: MALL.MEGA_WORLD,
    label: "Megaworld",
  },
];

// 表单初始值：和 Vue 版 form 字段保持同名，方便未来接入接口。
const INITIAL_FORM = {
  mall_type: MALL.SM,
  file_download_url: "",
  external_id: "",
  external_no: "",
  pos_id: "",
};

// 替换部分旧语言包里使用的 {mall}/{path} 占位符，兼容 i18next 的 {{mall}} 写法。
function interpolateLegacyTemplate(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value ?? ""), template);
}

function MallCetification() {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();

  // 保存设置按钮 loading。
  const [submitLoading, setSubmitLoading] = useState(false);
  // 初始加载设置 loading，后续接入接口时可替换为真实请求状态。
  const [loadingSettings, setLoadingSettings] = useState(false);
  // 补充生成认证文件按钮 loading。
  const [isRegenerating, setIsRegenerating] = useState(false);
  // 日期范围，限制为最多 7 天且不能选未来日期。
  const [regenerateDateRange, setRegenerateDateRange] = useState([]);
  // 当前表单值镜像：用于控制字段显隐和卡片说明文案。
  const [formState, setFormState] = useState(INITIAL_FORM);

  // 页面加载时读取主进程本地商场认证设置。
  useEffect(() => {
    let mounted = true;

    setLoadingSettings(true);
    window.api.settings
      .getMallCertificationSettings()
      .then((settings) => {
        if (!mounted) return;
        const nextSettings = { ...INITIAL_FORM, ...settings };
        form.setFieldsValue(nextSettings);
        setFormState(nextSettings);
      })
      .catch((error) => {
        message.error(error?.message ?? "Failed to load mall certification settings.");
      })
      .finally(() => {
        if (mounted) {
          setLoadingSettings(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [form, message]);

  // 当前商场名称，说明文案依赖 mall_type 动态展示。
  const currentMallName = MALL_NAME_MAP.get(formState.mall_type) || "";

  // 当前认证文件目录：SM 使用默认目录，Parqal/Megaworld 使用用户选择或默认目录。
  const currentFileDirectory = useMemo(() => {
    if (!formState.mall_type) return "";
    if (formState.mall_type === MALL.PARQAL || formState.mall_type === MALL.MEGA_WORLD) {
      return formState.file_download_url;
    }
    return FILE_MAP.get(formState.mall_type) || "";
  }, [formState.file_download_url, formState.mall_type]);

  // 商场设置说明文案：兼容中/泰/高棉旧占位符和英文 i18next 占位符。
  const mallSettingTip = interpolateLegacyTemplate(t("tips.mall_setting_tip", { mall: currentMallName }), {
    mall: currentMallName,
  });

  // 补充生成说明文案：根据当前商场目录动态显示保存位置。
  const mallReportSavedTip = interpolateLegacyTemplate(t("tips.mall_report_saved", { path: currentFileDirectory }), {
    path: currentFileDirectory,
  });

  // 禁用明天及以后的日期，和 Vue pickerOptions.disabledDate 保持一致。
  const disabledFutureDate = (current) => {
    if (!current) return false;
    return current.startOf("day").isAfter(dayjs().startOf("day"));
  };

  // 切换商场时重置认证字段；Megaworld 先填默认目录，仍允许用户自定义。
  const handleMallTypeChange = (value) => {
    const nextForm = {
      mall_type: value,
      file_download_url: value === MALL.MEGA_WORLD ? "D:\\Megaworld" : "",
      external_id: "",
      external_no: "",
      pos_id: "",
    };

    form.setFieldsValue(nextForm);
    setFormState(nextForm);
  };

  // 表单值变化时同步镜像状态，用于即时控制 UI 显隐和提示文案。
  const handleValuesChange = (_, allValues) => {
    setFormState((prev) => ({
      ...prev,
      ...allValues,
    }));
  };

  // 选择文件夹：通过 SETTINGS 模块 IPC 获取用户选择目录。
  const selectFolder = async () => {
    if (!window.api?.settings?.selectMallCertificationFolder) {
      message.error("当前项目尚未暴露 window.api.settings.selectMallCertificationFolder。");
      return;
    }

    const selectedPath = await window.api.settings.selectMallCertificationFolder();
    if (!selectedPath) return;

    form.setFieldValue("file_download_url", selectedPath);
    setFormState((prev) => ({ ...prev, file_download_url: selectedPath }));
  };

  // 提交设置：保存到主进程本地 settings 表，不请求服务器。
  const onSubmit = async () => {
    const values = await form.validateFields();
    const payload = { ...values };

    if (payload.mall_type === MALL.SM) {
      payload.external_id = undefined;
      payload.external_no = undefined;
      payload.pos_id = undefined;
      payload.file_download_url = "C:\\SIA";
    }

    if (payload.mall_type === MALL.MEGA_WORLD && !payload.file_download_url) {
      payload.file_download_url = "D:\\Megaworld";
    }

    try {
      setSubmitLoading(true);
      const savedSettings = await window.api.settings.saveMallCertificationSettings(payload);
      setFormState((prev) => ({ ...prev, ...savedSettings }));
      form.setFieldsValue(savedSettings);
      message.success(t("tips.success"));
    } catch (error) {
      message.error(error?.message ?? "Failed to save mall certification settings.");
    } finally {
      setSubmitLoading(false);
    }
  };

  // 选择日期后限制最多 7 天，结束日期由生成逻辑按 23:59:59 处理。
  const selectDate = (dates) => {
    const nextDates = dates || [];

    if (nextDates.length === 2) {
      const [start, end] = nextDates;
      const period = end.startOf("day").diff(start.startOf("day"), "day");

      if (period >= 7) {
        message.error("选择日期不能超过7天");
        setRegenerateDateRange([]);
        return;
      }
    }

    setRegenerateDateRange(nextDates);
  };

  // 补充生成认证文件：主进程查询本地数据库并写入本地文件。
  const regenerateFile = async () => {
    if (!currentFileDirectory) {
      message.error("Please set the file directory first.");
      return;
    }

    const [start, end] = regenerateDateRange;

    try {
      setIsRegenerating(true);
      const result = await window.api.settings.regenerateMallCertificationFiles({
        start_date: start.format("YYYY-MM-DD"),
        end_date: end.format("YYYY-MM-DD"),
      });
      const warnings = result?.warnings ?? [];
      const missingTables = result?.missing_tables ?? [];

      if (missingTables.length > 0) {
        message.warning(`Missing local data: ${missingTables.join(", ")}`);
      } else if (warnings.length > 0) {
        message.warning(warnings.join(" "));
      } else {
        message.success(t("setting.regenerate_completed"));
      }
    } catch (error) {
      message.error(error?.message ?? "Regenerate failed.");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* 商场认证设置卡片：对应 Vue 版第一个 div-item。 */}
      <div className="m-6 w-[560px] overflow-hidden rounded-[10px] border border-[#E8E8E8] bg-white">
        {/* 卡片标题和商场说明文案。 */}
        <div className="border-b border-[#E8E8E8] px-6 pb-3 pt-6">
          <div className="text-[24px] font-semibold leading-[22px] text-[#1E1E1E]">{t("setting.mall_settings")}</div>
          <p className="mt-2! text-[12px] font-normal text-[#4b5567]">{mallSettingTip}</p>
        </div>

        <Spin spinning={loadingSettings}>
          <div className="w-[500px] px-0 py-6">
            <Form
              form={form}
              labelCol={{ flex: "180px" }}
              wrapperCol={{ flex: 1 }}
              labelAlign="right"
              colon={false}
              initialValues={INITIAL_FORM}
              onValuesChange={handleValuesChange}
            >
              {/* 选择商场：改变后会重置下面的商场认证字段。 */}
              <Form.Item
                label={t("setting.select_mall")}
                name="mall_type"
                rules={[{ required: true, message: t("setting.please_select_mall") }]}
              >
                <Select
                  size="normal"
                  placeholder={t("setting.please_select_mall")}
                  options={MALL_LIST}
                  onChange={handleMallTypeChange}
                />
              </Form.Item>

              {/* 认证文件保存位置：SM 固定路径，Parqal/Megaworld 可选择目录。 */}
              {formState.mall_type && (
                <Form.Item
                  label={t("setting.file_directory")}
                  name="file_download_url"
                  rules={[
                    {
                      required: formState.mall_type === MALL.PARQAL || formState.mall_type === MALL.MEGA_WORLD,
                      message: t("setting.please_input_file_directory"),
                    },
                  ]}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-h-[24px] flex-1 break-all">{currentFileDirectory}</span>
                    {(formState.mall_type === MALL.PARQAL || formState.mall_type === MALL.MEGA_WORLD) && (
                      <Button size="normal" type="primary" ghost onClick={selectFolder}>
                        {t("setting.select_folder")}
                      </Button>
                    )}
                  </div>
                </Form.Item>
              )}

              {/* Parqal/Megaworld 认证字段；SM 不需要填写。 */}
              {formState.mall_type && formState.mall_type !== MALL.SM && (
                <>
                  {/* Parqal: Tenant ID；Megaworld: Mall Partner Code ID。 */}
                  <Form.Item
                    label={
                      formState.mall_type === MALL.PARQAL ? t("setting.tenant_id") : t("setting.mall_partner_code_id")
                    }
                    name="external_id"
                    rules={[
                      { required: true, message: t("setting.input_tenant_id") },
                      {
                        pattern: /^\S+(?:\s+\S+)*$/,
                        message: t("setting.no_outer_spaces"),
                      },
                    ]}
                  >
                    <Input
                      size="normal"
                      placeholder={t("setting.input_tenant_id")}
                      maxLength={formState.mall_type === MALL.PARQAL ? 25 : 8}
                      showCount
                    />
                  </Form.Item>

                  {/* Tenant Key：仅 Parqal 显示。 */}
                  {formState.mall_type === MALL.PARQAL && (
                    <Form.Item
                      label={t("setting.tenant_key")}
                      name="external_no"
                      rules={[
                        { required: true, message: t("setting.input_tenant_key") },
                        {
                          pattern: /^\S+(?:\s+\S+)*$/,
                          message: t("setting.no_outer_spaces"),
                        },
                      ]}
                    >
                      <Input size="normal" placeholder={t("setting.input_tenant_key")} maxLength={25} showCount />
                    </Form.Item>
                  )}

                  {/* Parqal: Terminal No；Megaworld: POS Terminal ID。 */}
                  <Form.Item
                    label={
                      formState.mall_type === MALL.PARQAL ? t("setting.terminal_no") : t("setting.pos_terminal_id")
                    }
                    name="pos_id"
                    rules={[
                      { required: true, message: t("setting.input_terminal_number") },
                      {
                        pattern: /^\S+(?:\s+\S+)*$/,
                        message: t("setting.no_outer_spaces"),
                      },
                    ]}
                  >
                    <Input
                      size="normal"
                      placeholder={t("setting.input_terminal_number")}
                      maxLength={formState.mall_type === MALL.PARQAL ? 25 : 4}
                      showCount
                    />
                  </Form.Item>
                </>
              )}

              {/* 提交设置：后端保存暂时占位。 */}
              <Form.Item label=" ">
                <Button type="primary" loading={submitLoading} onClick={onSubmit}>
                  {t("components.submit")}
                </Button>
              </Form.Item>
            </Form>
          </div>
        </Spin>
      </div>

      {/* 补充生成认证文件：所有商场均支持按日期范围重新生成。 */}
      {formState.mall_type && (
        <div className="m-6 w-[560px] overflow-hidden rounded-[10px] border border-[#E8E8E8] bg-white pb-6">
          {/* 补充生成卡片标题和保存路径提示。 */}
          <div className="border-b border-[#E8E8E8] px-6 pb-3 pt-6">
            <div className="text-[24px] font-semibold leading-[22px] text-[#1E1E1E]">
              {t("setting.regenerated_file")}
            </div>
            <p className="mt-2! text-[12px] font-normal text-[#4b5567]">{mallReportSavedTip}</p>
          </div>

          {/* 日期范围选择：禁用未来日期，最多选择 7 天。 */}
          <div className="flex w-[500px] items-center pt-6">
            <div className="w-[160px] pr-3 text-right text-[14px] font-semibold text-[#4b5567]">
              {t("components.select_date")}
            </div>
            <div className="flex-1">
              <RangePicker
                className="w-full"
                value={regenerateDateRange}
                disabledDate={disabledFutureDate}
                placeholder={[t("components.start_date"), t("components.end_date")]}
                onChange={selectDate}
              />
            </div>
          </div>

          {/* 补充生成按钮：后端生成和下载暂时占位。 */}
          <div className="flex w-[500px] items-center pt-6">
            <div className="w-[160px] pr-3 text-right text-[14px] font-semibold text-[#4b5567]" />
            <div className="flex-1">
              <Button
                type="primary"
                loading={isRegenerating}
                disabled={regenerateDateRange.length !== 2}
                onClick={regenerateFile}
              >
                {t("components.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MallCetification;
