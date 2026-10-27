import Header from "@renderer/components/Header";
import { Button, Select, DatePicker, Radio, Table, Modal, Form, Input, InputNumber, message, Image } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import EmptyHolder from "@renderer/components/EmptyHolder";
import RollingNumber from "@renderer/components/RollingNumber";

import { useTranslation } from "react-i18next";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import PropTypes from "prop-types";

import dayjs from "dayjs";
import Big from "big.js";
import { format } from "@renderer/utils/MoneyUtils";
import useStore from "@renderer/store";
import useCashOnHandModal from "@renderer/hooks/useCashOnHandModal";
import useGsapTableAnimation from "@renderer/hooks/useGsapTableAnimation";
import DateAndTime from "./components/DateAndTime";

const REPORT_TYPES = {
  EOS_REPORT: 1,
  SUMMARY_OF_PRODUCTS: 2,
};

const REPORT_PRINT_TYPES = {
  END_OF_SHIFT: 1,
  SUMMARY_OF_PRODUCT: 3,
};

const CASHIER_ALL = "all";
const CASHIER_SELF_SERVICE = "0";
const CATEGORY_ALL = "all";

const toCents = (amount) => Number(new Big(amount || 0).times(100).round(0, 1).toString());

// 获取月份的按天班次列表
const getMonthDayShiftList = (monthStr) => {
  if (!monthStr) return [];
  // monthStr: "YYYY-MM"
  const monthStart = dayjs(`${monthStr}-01`);
  const isCurrentMonth = monthStart.isSame(dayjs(), "month") && monthStart.isSame(dayjs(), "year");

  const totalDays = isCurrentMonth ? dayjs().date() : monthStart.daysInMonth();

  const arr = [];
  for (let d = totalDays; d >= 1; d--) {
    const day = monthStart.date(d);
    const isToday = day.isSame(dayjs(), "day");
    const startTime = day.startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const endTime =
      isCurrentMonth && isToday
        ? dayjs().format("YYYY-MM-DD HH:mm:ss")
        : day.endOf("day").format("YYYY-MM-DD HH:mm:ss");

    arr.push({
      key: day.format("YYYY-MM-DD"),
      label: `${startTime} - ${endTime}`,
      start_time: startTime,
      end_time: endTime,
    });
  }
  return arr;
};

// 获取月份的初始和结束时间
const getMonthRange = (monthStr) => {
  const monthStart = dayjs(`${monthStr}-01`).startOf("month");

  return {
    start_time: monthStart.format("YYYY-MM-DD HH:mm:ss"),
    end_time: monthStart.endOf("month").format("YYYY-MM-DD HH:mm:ss"),
  };
};

const Reports = () => {
  const { t } = useTranslation();
  const [cashWithdrawalForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const user = useStore((state) => state.user);
  const currentMonth = dayjs().startOf("month");
  const [activeReportType, setActiveReportType] = useState(REPORT_TYPES.EOS_REPORT); // 报告类型选择
  const [selectedShiftMonth, setSelectedShiftMonth] = useState(currentMonth.format("YYYY-MM"));
  const [selectedShiftDay, setSelectedShiftDay] = useState("");
  const [selectedCashierNo, setSelectedCashierNo] = useState("");
  const [staffShiftList, setStaffShiftList] = useState(null);
  const [selectedReportRange, setSelectedReportRange] = useState(null);
  const [summaryDetail, setSummaryDetail] = useState(null); // 报告详情数据
  const [loadingReportDetail, setLoadingReportDetail] = useState(false);
  const [isCashWithdrawalOpen, setIsCashWithdrawalOpen] = useState(false);
  const [submittingCashWithdrawal, setSubmittingCashWithdrawal] = useState(false);
  const [submittingCashOnHand, setSubmittingCashOnHand] = useState(false);

  const [previewingCashierReport, setPreviewingCashierReport] = useState(false);
  const [cashierReportPreviewOpen, setCashierReportPreviewOpen] = useState(false);
  const [cashierReportPreviewImage, setCashierReportPreviewImage] = useState("");

  const [staffList, setStaffList] = useState([]);
  const [categoryList, setCategoryList] = useState([]);

  // 获取category数据
  const loadCategoryList = useCallback(async () => {
    try {
      const dishList = await window.api.dish.getCategoryList();
      setCategoryList(Array.isArray(dishList) ? dishList : []);
    } catch (error) {
      console.error("Failed to get category list:", error);
      setCategoryList([]);
    }
  }, []);

  const disabledDateForMonth = (current) => {
    // Disable months after the current month, but keep the current month selectable.
    return current && current.startOf("month").isAfter(currentMonth);
  };

  const monthDayShiftList = useMemo(() => getMonthDayShiftList(selectedShiftMonth), [selectedShiftMonth]);

  const shiftList = useMemo(() => {
    if (!selectedCashierNo || selectedCashierNo === CASHIER_ALL) return [];
    if (selectedCashierNo === CASHIER_SELF_SERVICE) return monthDayShiftList;

    return staffShiftList?.cashierNo === selectedCashierNo && staffShiftList?.monthStr === selectedShiftMonth
      ? staffShiftList.items
      : [];
  }, [monthDayShiftList, selectedCashierNo, selectedShiftMonth, staffShiftList]);

  const selectedShift = useMemo(
    () => shiftList.find((shift) => shift.key === selectedShiftDay),
    [selectedShiftDay, shiftList],
  );

  // 仅当前未结束班次允许录入提现。
  const shouldShowCashWithdrawal =
    activeReportType === REPORT_TYPES.EOS_REPORT &&
    Boolean(selectedShift) &&
    selectedShift.label === t("report.current_shift") &&
    !selectedShift.off_time;
  // 在线端通过 withdrawalRecord.length 判断是否已做过 Cash Withdrawal；离线端兼容 snake/camel 两种返回字段。

  const canGenerateCashierReport = Boolean(selectedReportRange);

  const activePrintReportType =
    activeReportType === REPORT_TYPES.EOS_REPORT
      ? REPORT_PRINT_TYPES.END_OF_SHIFT
      : REPORT_PRINT_TYPES.SUMMARY_OF_PRODUCT;

  // 点击班次获取report
  const handleShiftClick = useCallback(
    async (shift) => {
      setSelectedShiftDay(shift.key);

      if (!user?.restaurant_id || !selectedCashierNo) {
        console.warn("Cashier report params missing", {
          restaurantId: user?.restaurant_id,
          waiterNo: selectedCashierNo,
          shift,
        });
        return;
      }

      setLoadingReportDetail(true);

      try {
        const requestReport =
          activeReportType === REPORT_TYPES.EOS_REPORT
            ? window.api.staff.getCashierReportByWaiter
            : window.api.report.getProductSummaryReport;
        const report = await requestReport({
          restaurantId: user.restaurant_id,
          startTime: shift.start_time,
          endTime: shift.end_time,
          waiterNo: selectedCashierNo,
        });

        // 只有真正选中并成功加载某个班次/时间范围后，底部报表按钮才可用。
        setSelectedReportRange({
          key: shift.key,
          start_time: shift.start_time,
          end_time: shift.end_time,
        });
        setSummaryDetail(report);
        console.log("report:", report);
      } catch (error) {
        console.error("Failed to get cashier report by waiter:", error);
      } finally {
        setLoadingReportDetail(false);
      }
    },
    [selectedCashierNo, user, activeReportType],
  );

  useEffect(() => {
    window.api.staff.getStaffList().then((res) => {
      const addtionalEoS = [{ name: t("report.self_service"), waiter_no: "0" }];
      const addtionalSummaryOfProducts = [
        { name: t("components.all"), waiter_no: CASHIER_ALL },
        { name: t("report.self_service"), waiter_no: "0" },
      ];
      setStaffList(
        activeReportType === REPORT_TYPES.EOS_REPORT
          ? addtionalEoS.concat(res)
          : addtionalSummaryOfProducts.concat(res),
      );
    });
  }, [activeReportType, t]);

  useEffect(() => {
    loadCategoryList();
  }, [loadCategoryList]);

  useEffect(() => {
    if (
      !selectedShiftMonth ||
      !selectedCashierNo ||
      selectedCashierNo === CASHIER_ALL ||
      selectedCashierNo === CASHIER_SELF_SERVICE
    ) {
      return undefined;
    }

    const selectedCashier = staffList.find((cashier) => cashier.waiter_no === selectedCashierNo);
    const waiterId = selectedCashier?.id;

    if (waiterId === undefined || waiterId === null) {
      return undefined;
    }

    let isActive = true;
    const range = getMonthRange(selectedShiftMonth);

    const loadStaffShiftList = async () => {
      const records = await window.api.staff.getStaffAllClockList({
        waiter_id: waiterId,
        start_time: range.start_time,
        end_time: range.end_time,
      });

      if (!isActive) return;

      setStaffShiftList({
        cashierNo: selectedCashierNo,
        monthStr: selectedShiftMonth,
        items: records.map((record, index) => {
          // 最新且未结束的班次在列表中只展示“当前班次”，避免重复展示开始时间。
          const isLatestCurrentShift = index === 0 && !record.off_time;

          return {
            key: String(record.record_id),
            label: isLatestCurrentShift
              ? t("report.current_shift")
              : `${record.working_time || "-"} - ${record.off_time || t("report.current_shift")}`,
            start_time: record.working_time,
            end_time: record.off_time || dayjs().format("YYYY-MM-DD HH:mm:ss"),
            ...record,
          };
        }),
      });
    };

    loadStaffShiftList().catch((error) => {
      console.error("Failed to refresh shift list:", error);
    });

    return () => {
      isActive = false;
    };
  }, [selectedCashierNo, selectedShiftMonth, staffList, t]);

  // 重置生成报告的参数
  const resetGenerateType = () => {
    setSummaryDetail(null);
    setSelectedCashierNo("");
    setSelectedShiftDay("");
    setSelectedReportRange(null);
    setCashierReportPreviewImage("");
    setCashierReportPreviewOpen(false);
  };

  // 取消提现录入时清空表单，避免下次打开残留输入。
  const handleCashWithdrawalCancel = () => {
    cashWithdrawalForm.resetFields();
    setIsCashWithdrawalOpen(false);
  };

  const refreshSelectedShiftReport = async () => {
    if (!selectedShift) {
      return;
    }

    await handleShiftClick({
      ...selectedShift,
      end_time: dayjs().format("YYYY-MM-DD HH:mm:ss"),
    });
  };

  const handleCashWithdrawalSubmit = async (values) => {
    if (!selectedCashierNo || !selectedShift) {
      return;
    }

    setSubmittingCashWithdrawal(true);

    try {
      // 提现金额按后端约定转换为 integer minor units 后写入本地班次资金表。
      await window.api.staff.addLessWithdrawal({
        waiter_no: selectedCashierNo,
        less_remark: values.withdrawalRemark,
        less_withdrawal: toCents(values.withdrawalAmount),
      });

      // 对齐在线端：Cash on Hand 默认展示当前报告金额减去本次提现后的余额。
      const cashOnHandAfterWithdrawal = Number(
        new Big(summaryDetail?.cash_on_hand || 0)
          .div(100)
          .minus(values.withdrawalAmount || 0)
          .toFixed(2),
      );
      handleCashWithdrawalCancel();
      openCashOnHandModal(cashOnHandAfterWithdrawal);
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setSubmittingCashWithdrawal(false);
    }
  };

  const handleCashOnHandAutoCalculate = async () => {
    closeCashOnHandModal();
    await refreshSelectedShiftReport();
  };

  const handleCashOnHandCancel = async () => {
    closeCashOnHandModal();
    await refreshSelectedShiftReport();
  };

  const handleCashOnHandConfirm = async (cashOnHand) => {
    if (!selectedCashierNo) {
      return;
    }

    setSubmittingCashOnHand(true);

    try {
      // Cash Withdrawal 后复用交接班 Cash on Hand 弹窗，但这里只更新当前班次资金，不做签退。
      await window.api.staff.updateCashOnHand({
        waiter_no: selectedCashierNo,
        cash_on_hand: toCents(cashOnHand),
      });
      closeCashOnHandModal();
      await refreshSelectedShiftReport();
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setSubmittingCashOnHand(false);
    }
  };

  const { cashOnHandModalHolder, closeCashOnHandModal, openCashOnHandModal } = useCashOnHandModal({
    loading: submittingCashOnHand,
    onAutoCalculate: handleCashOnHandAutoCalculate,
    onCancel: handleCashOnHandCancel,
    onConfirm: handleCashOnHandConfirm,
  });

  const getCashierReportParams = () => {
    if (!selectedReportRange || !user?.restaurant_id) {
      return null;
    }

    return {
      restaurantId: user.restaurant_id,
      startTime: selectedReportRange.start_time,
      endTime:
        selectedShift && !selectedShift.off_time ? dayjs().format("YYYY-MM-DD HH:mm:ss") : selectedReportRange.end_time,
      waiterNo: selectedCashierNo,
      type: activePrintReportType,
    };
  };

  const handlePreviewCashierReport = async () => {
    const params = getCashierReportParams();

    if (!params) {
      return;
    }

    setPreviewingCashierReport(true);

    try {
      // View Digital Copy 使用与打印完全相同的报表文本，只渲染为图片预览。
      const imageUrl = await window.api.report.previewCashierReport(params);
      setCashierReportPreviewImage(imageUrl);
      setCashierReportPreviewOpen(true);
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setPreviewingCashierReport(false);
    }
  };

  return (
    <div>
      {contextHolder}
      <Header currentTitle={t("menu.cashier_report")} />
      <div className="flex h-[calc(100vh-64px)]">
        {/* 报告类型等 */}
        <div className="w-[380px] shrink-0 h-full p-6 border-r border-line flex flex-col min-h-0 overflow-y-auto">
          <p className="text-[17px] font-semibold text-normal border-b border-line py-2! m-0!">
            {t("report.report_type")}
          </p>
          <div
            onClick={() => {
              setActiveReportType(REPORT_TYPES.EOS_REPORT);
              resetGenerateType();
            }}
            style={activeReportType === REPORT_TYPES.EOS_REPORT ? { backgroundColor: "#003498", color: "#fff" } : {}}
            className="w-full h-[56px] shrink-0 my-3 border border-primary text-primary rounded-md flex items-center justify-center hover:bg-primary hover:text-white cursor-pointer"
          >
            <span className="text-[16px] font-semibold">{t("report.eos_report")}</span>
          </div>
          <div
            onClick={() => {
              setActiveReportType(REPORT_TYPES.SUMMARY_OF_PRODUCTS);
              resetGenerateType();
            }}
            style={
              activeReportType === REPORT_TYPES.SUMMARY_OF_PRODUCTS ? { backgroundColor: "#003498", color: "#fff" } : {}
            }
            className="w-full h-[56px] shrink-0 border border-primary text-primary rounded-md flex items-center justify-center hover:bg-primary hover:text-white cursor-pointer"
          >
            <span className="text-[16px] font-semibold">{t("report.summary_of_products")}</span>
          </div>

          {/* 选择cashier */}
          <p className="text-[17px] font-semibold text-normal border-b border-line py-2! m-0! mt-4!">
            {t("report.cashier")}
          </p>
          <Select
            style={{ width: "100%", marginTop: "12px" }}
            value={selectedCashierNo || undefined}
            options={staffList.map((cashier) => ({
              label: cashier.name,
              value: cashier.waiter_no,
            }))}
            onChange={(value) => {
              setSelectedCashierNo(value);
              setSelectedShiftDay("");
              setStaffShiftList(null);
              setSelectedReportRange(null);
              setSummaryDetail(null);
            }}
          />

          {selectedCashierNo === CASHIER_ALL ? (
            <DateAndTime
              handleShiftClick={handleShiftClick}
              selectedShiftDay={selectedShiftDay}
              setSelectedShiftDay={setSelectedShiftDay}
            />
          ) : (
            <>
              {/* shift */}
              <div className="flex items-center border-b border-line py-2! mt-4">
                <p className="flex-1 text-[17px] font-semibold text-normal m-0!">{t("report.shift")}</p>
                <DatePicker
                  picker="month"
                  value={selectedShiftMonth ? dayjs(`${selectedShiftMonth}-01`) : null}
                  disabledDate={disabledDateForMonth}
                  placeholder={""}
                  onChange={(date) => {
                    const nextMonth = date ? date.format("YYYY-MM") : "";
                    setSelectedShiftMonth(nextMonth);
                    setSelectedShiftDay("");
                    setStaffShiftList(null);
                    setSelectedReportRange(null);
                    setSummaryDetail(null);
                  }}
                />
              </div>
              <div className="w-full flex-1 min-h-0 overflow-y-auto pr-1">
                {shiftList.length > 0 ? (
                  shiftList.map((shift) => (
                    <div
                      key={shift.key}
                      className="w-full flex items-center cursor-pointer border-b border-line pt-4 pb-2"
                      onClick={() => handleShiftClick(shift)}
                    >
                      <span className="flex-1 text-[12px] font-medium">{shift.label}</span>
                      <Radio checked={selectedShiftDay === shift.key} />
                    </div>
                  ))
                ) : (
                  <EmptyHolder />
                )}
              </div>
            </>
          )}
          <div className="w-full pt-4 shrink-0">
            {shouldShowCashWithdrawal ? (
              <Button
                color="primary"
                variant="outlined"
                className="w-full mb-3!"
                style={{ height: "56px" }}
                disabled={loadingReportDetail}
                onClick={() => setIsCashWithdrawalOpen(true)}
              >
                <span className="text-[16px] font-semibold">{t("report.cash_withdrawal")}</span>
              </Button>
            ) : null}

            {canGenerateCashierReport ? (
              <Button
                color="primary"
                variant="outlined"
                className="w-full mt-3!"
                style={{ height: "56px" }}
                loading={previewingCashierReport}
                disabled={loadingReportDetail}
                onClick={handlePreviewCashierReport}
              >
                <span className="text-[16px] font-semibold">{t("order.view_digital_copy")}</span>
              </Button>
            ) : null}
          </div>
        </div>
        {/* 交易汇总 */}
        {activeReportType === REPORT_TYPES.EOS_REPORT ? (
          <TransactionSummary summaryDetail={summaryDetail} />
        ) : (
          <ProductSummary summaryDetail={summaryDetail} categoryList={categoryList} />
        )}
      </div>
      <Modal
        width={420}
        title={t("report.less_withdrawal")}
        open={isCashWithdrawalOpen}
        okText={t("components.confirm")}
        mask={{ blur: true }}
        cancelText={t("components.cancel")}
        onCancel={handleCashWithdrawalCancel}
        onOk={() => cashWithdrawalForm.submit()}
        confirmLoading={submittingCashWithdrawal}
        destroyOnHidden
      >
        <Form form={cashWithdrawalForm} layout="vertical" onFinish={handleCashWithdrawalSubmit}>
          <Form.Item
            label={t("report.withdrawal_remark")}
            name="withdrawalRemark"
            rules={[
              {
                required: true,
                whitespace: true,
                message: t("tips.field_required", { field: t("report.withdrawal_remark") }),
              },
              {
                max: 20,
                message: t("tips.max_characters", { field: t("report.withdrawal_remark"), count: 20 }),
              },
            ]}
          >
            <Input maxLength={20} showCount />
          </Form.Item>
          <Form.Item
            label={t("report.withdrawal_amount")}
            name="withdrawalAmount"
            rules={[
              {
                required: true,
                message: t("tips.field_required", { field: t("report.withdrawal_amount") }),
              },
              {
                // 金额最多保留两位小数，提交业务后续接入。
                validator: (_, value) => {
                  if (value === undefined || value === null || value === "") {
                    return Promise.resolve();
                  }
                  return /^\d+(\.\d{1,2})?$/.test(String(value))
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(t("tips.max_decimal_places", { field: t("report.withdrawal_amount"), count: 2 })),
                      );
                },
              },
            ]}
          >
            <InputNumber className="w-full!" min={0} precision={2} step="0.01" stringMode />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={cashierReportPreviewOpen}
        footer={null}
        width={680}
        closeIcon={<CloseOutlined className="text-[#3157ff] text-[24px]" />}
        style={{ top: 22 }}
        styles={{
          content: { padding: 0, borderRadius: 0, background: "#fff" },
          body: { padding: 0, maxHeight: "92vh", overflowY: "auto" },
          mask: { backgroundColor: "rgba(0, 0, 0, 0.5)" },
        }}
        onCancel={() => setCashierReportPreviewOpen(false)}
      >
        {cashierReportPreviewImage && (
          <Image
            src={cashierReportPreviewImage}
            alt={t("order.view_digital_copy")}
            preview={false}
            className="block w-full"
          />
        )}
      </Modal>
      {cashOnHandModalHolder}
    </div>
  );
};

// eos 报告详情
const TransactionSummary = ({ summaryDetail }) => {
  const { t } = useTranslation();
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const { currency_symbol } = restaurantSetting;
  const transactionTableWrapperRef = useRef(null);
  const transactionTableData = useMemo(
    () => summaryDetail?.channel_settlement_reports ?? [],
    [summaryDetail?.channel_settlement_reports],
  );
  const transactionTableAnimationKey = useMemo(() => {
    return transactionTableData
      .map((item, index) => item.channel_code ?? item.channel_name ?? `channel-${index}`)
      .join("|");
  }, [transactionTableData]);

  // End of Shift 支付渠道表格在切换班次后复用公共表格动画。
  useGsapTableAnimation(transactionTableWrapperRef, [transactionTableAnimationKey]);

  const columns = [
    {
      title: t("report.payment_type"),
      dataIndex: "channel_name",
      key: "channel_name",
    },
    {
      title: t("report.no_of_transactions"),
      dataIndex: "transaction_count",
      key: "transaction_count",
    },
    {
      title: t("report.total_amount"),
      dataIndex: "transaction_amount",
      key: "transaction_amount",
      render: (text) => (
        <span>
          {currency_symbol} <RollingNumber value={`${format(text)}`} />
        </span>
      ),
    },
  ];

  return (
    <>
      {summaryDetail === null ? (
        <EmptyHolder></EmptyHolder>
      ) : (
        <div className="flex-1 h-full py-4 px-5">
          <div className="w-full flex items-center border-b border-line pb-2.5! my-2.5">
            <p className="flex-1 m-0! text-[20px] text-normal font-semibold">{t("report.transaction_summary")}</p>
          </div>
          <TransactionSummaryOverview currencySymbol={currency_symbol} transactionSummary={summaryDetail} />

          <div ref={transactionTableWrapperRef} className="my-6">
            <Table
              rowKey={(row, index) => row.channel_code ?? row.channel_name ?? `channel-${index}`}
              pagination={false}
              columns={columns}
              dataSource={transactionTableData}
              className="custom-table-header"
            />
          </div>

          <div className="w-full h-fit">
            {/* total amount */}
            <div className="text-[16px] flex items-center mb-2">
              <span className="flex-1 font-semibold">{t("report.total_amount")}</span>
              <span className="text-primary font-semibold">
                {currency_symbol}{" "}
                <RollingNumber className="text-primary font-semibold" value={`${format(summaryDetail.total_amount)}`} />
              </span>
            </div>
            {/* cancelled */}
            <div className="text-[14px] flex items-center mb-1">
              <span className="flex-1 font-medium">{t("report.cancelled")}</span>
              <span>
                {currency_symbol} <RollingNumber value={`${format(summaryDetail.cancelled_amount)}`} />
              </span>
            </div>
            {/* refund */}
            <div className="text-[14px] flex items-center mb-1">
              <span className="flex-1 font-medium">{t("report.refund")}</span>
              <span>
                {currency_symbol} <RollingNumber value={`${format(summaryDetail.refund_amount)}`} />
              </span>
            </div>
            {/* withdrawal */}
            <div className="text-[14px] flex items-center mb-1">
              <span className="flex-1 font-medium">{t("report.withdrawal")}</span>
              <span>
                {currency_symbol} <RollingNumber value={`${format(summaryDetail.withdrawal)}`} />
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// 商品汇总详情
const ProductSummary = ({ summaryDetail, categoryList }) => {
  const { t } = useTranslation();
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const { currency_symbol } = restaurantSetting;
  const [selectedCategoryNo, setSelectedCategoryNo] = useState(CATEGORY_ALL);
  const productSummaryTableWrapperRef = useRef(null);

  const categoryOptions = useMemo(
    () => [
      { value: CATEGORY_ALL, label: t("components.all") },
      ...categoryList.map((category) => ({
        value: category.category_no,
        label: category.name,
      })),
    ],
    [categoryList],
  );

  const selectedCategoryName = useMemo(() => {
    if (selectedCategoryNo === CATEGORY_ALL) {
      return "";
    }

    return categoryList.find((category) => category.category_no === selectedCategoryNo)?.name ?? "";
  }, [categoryList, selectedCategoryNo]);

  const filteredProductSummaryInfos = useMemo(() => {
    const list = Array.isArray(summaryDetail?.product_summary_infos) ? summaryDetail.product_summary_infos : [];

    if (!selectedCategoryName) {
      return list;
    }

    // Product summary 当前结果只带 category_name，因此页面筛选按分类名称匹配。
    return list.filter((item) => item.category_name === selectedCategoryName);
  }, [selectedCategoryName, summaryDetail]);

  const visibleSubAmount = useMemo(
    () =>
      selectedCategoryNo === CATEGORY_ALL
        ? Number(summaryDetail?.sub_amount ?? 0)
        : filteredProductSummaryInfos.reduce((sum, item) => sum + Number(item.total_amount ?? 0), 0),
    [filteredProductSummaryInfos, selectedCategoryNo, summaryDetail?.sub_amount],
  );
  const visibleTotalAmount = useMemo(
    () =>
      selectedCategoryNo === CATEGORY_ALL
        ? Number(summaryDetail?.total_amount ?? 0)
        : filteredProductSummaryInfos.reduce((sum, item) => sum + Number(item.total_amount ?? 0), 0),
    [filteredProductSummaryInfos, selectedCategoryNo, summaryDetail?.total_amount],
  );
  const visibleProductCount = useMemo(
    () => filteredProductSummaryInfos.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    [filteredProductSummaryInfos],
  );
  const productSummaryTableAnimationKey = useMemo(() => {
    return filteredProductSummaryInfos
      .map((item, index) => item.sku_no ?? `${item.category_name}-${item.product_name}-${index}`)
      .join("|");
  }, [filteredProductSummaryInfos]);

  // Product Summary 表格复用订单详情动画：筛选后行增删和位置变化都平滑过渡。
  useGsapTableAnimation(productSummaryTableWrapperRef, [selectedCategoryNo, productSummaryTableAnimationKey]);

  const columns = [
    {
      title: t("order.category_name"),
      dataIndex: "category_name",
      key: "category_name",
    },
    {
      title: t("order.item_name"),
      dataIndex: "product_name",
      key: "product_name",
    },
    {
      title: t("order.variation"),
      dataIndex: "spec_name",
      key: "variation",
      // Variation 是规格名称，主进程 specName 到渲染进程后为 spec_name。
      render: (text) => <span>{text || "-"}</span>,
    },
    {
      title: t("order.quantity"),
      dataIndex: "quantity",
      key: "quantity",
    },
    {
      title: t("order.price"),
      dataIndex: "price",
      key: "price",
      render: (text) => (
        <span>
          {currency_symbol} <RollingNumber value={`${format(text)}`} />
        </span>
      ),
    },
    {
      title: t("order.sub_total"),
      dataIndex: "total_amount",
      key: "sub_total",
      render: (text) => (
        <span>
          {currency_symbol} <RollingNumber value={`${format(text)}`} />
        </span>
      ),
    },
  ];

  return (
    <>
      {summaryDetail === null ? (
        <EmptyHolder></EmptyHolder>
      ) : (
        <div className="flex-1 h-full min-h-0 py-4 px-5 flex flex-col">
          <div className="w-full shrink-0 flex items-center border-b border-line pb-2.5! my-2.5">
            <p className="flex-1 m-0! text-[20px] text-normal font-semibold">{t("report.product_summary")}</p>
            <Select
              style={{ width: "160px" }}
              value={selectedCategoryNo}
              options={categoryOptions}
              onChange={setSelectedCategoryNo}
            ></Select>
          </div>
          <div className="flex shrink-0 flex-nowrap">
            <div className="px-6 border-r border-line">
              <span className="block">{t("order.sub_total")}</span>
              <span className="text-primary font-semibold text-[20px]">
                {currency_symbol}{" "}
                <RollingNumber
                  className="text-primary font-semibold text-[20px]"
                  value={`${format(visibleSubAmount)}`}
                />
              </span>
            </div>
            <div className="px-6 border-r border-line">
              <span className="block">{t("report.quantity_of_items")}</span>
              <span className="text-primary font-semibold text-[20px]">
                <RollingNumber className="text-primary font-semibold text-[20px]" value={`${visibleProductCount}`} />
              </span>
            </div>
            <div className="px-6 border-r border-line">
              <span className="block">{t("order.discount")}</span>
              <span className="text-primary font-semibold text-[20px]">
                {currency_symbol}{" "}
                <RollingNumber
                  className="text-primary font-semibold text-[20px]"
                  value={`${format(summaryDetail.discount_amount)}`}
                />
              </span>
            </div>
            <div className="px-6 border-r border-line">
              <span className="block">{t("report.total_amount")}</span>
              <span className="text-primary font-semibold text-[20px]">
                {currency_symbol}{" "}
                <RollingNumber
                  className="text-primary font-semibold text-[20px]"
                  value={`${format(visibleTotalAmount)}`}
                />
              </span>
            </div>
          </div>

          <div ref={productSummaryTableWrapperRef} className="flex-1 min-h-0 my-6">
            <Table
              rowKey={(row, index) => row.sku_no ?? `${row.category_name}-${row.product_name}-${index}`}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              columns={columns}
              dataSource={filteredProductSummaryInfos}
              scroll={{ y: "max(160px, calc(100vh - 360px))" }}
              className="custom-table-header"
            />
          </div>
        </div>
      )}
    </>
  );
};

const TransactionSummaryOverview = ({ currencySymbol, transactionSummary }) => {
  const { t } = useTranslation();
  const { opening_fund, cash_on_hand, less_withdrawal, payment_received, short_or_over } = transactionSummary;
  const overviews = [
    [t("report.opening_fund"), opening_fund],
    [t("report.cash_on_hand"), cash_on_hand],
    [t("report.less_withdrawal"), less_withdrawal],
    [t("report.payment_received"), payment_received],
    [t("report.short_over"), short_or_over],
  ];
  return (
    <div className="flex items-center">
      {overviews.map(([label, value], index) => (
        <div
          key={label}
          className="border-r border-line pr-5 mr-5"
          style={index === overviews.length - 1 ? { border: "none" } : {}}
        >
          <div className="text-left">
            <span className="text-[12px] text-normal">{label}</span>
          </div>
          <div>
            <span className="text-[22px] text-primary font-semibold">
              {currencySymbol}{" "}
              <RollingNumber className="text-[22px] text-primary font-semibold" value={`${format(value)}`} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

TransactionSummaryOverview.propTypes = {
  currencySymbol: PropTypes.string,
  transactionSummary: PropTypes.object.isRequired,
};

TransactionSummary.propTypes = {
  summaryDetail: PropTypes.object.isRequired,
};

ProductSummary.propTypes = {
  summaryDetail: PropTypes.object.isRequired,
  categoryList: PropTypes.array.isRequired,
};

export default Reports;
