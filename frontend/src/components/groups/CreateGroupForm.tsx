import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsApi } from '../../api/groups';
import Input from '../ui/Input';
import Button from '../ui/Button';

const createGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  description: z.string().optional(),
});

type CreateGroupFormData = z.infer<typeof createGroupSchema>;

interface CreateGroupFormProps {
  onSuccess: () => void;
}

export default function CreateGroupForm({ onSuccess }: CreateGroupFormProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateGroupFormData>({
    resolver: zodResolver(createGroupSchema),
  });

  const createMutation = useMutation({
    mutationFn: groupsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      onSuccess();
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Failed to create group');
    },
  });

  const onSubmit = (data: CreateGroupFormData) => {
    createMutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Group Name"
        placeholder="The Lost Mines Campaign"
        error={errors.name?.message}
        {...register('name')}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description (optional)
        </label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          rows={3}
          placeholder="A brief description of your campaign..."
          {...register('description')}
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onSuccess}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          isLoading={createMutation.isPending}
        >
          Create Group
        </Button>
      </div>
    </form>
  );
}
